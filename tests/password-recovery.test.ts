import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { hashPassword, verifyPassword } from "../server/authSession.ts";
import {
  PASSWORD_RECOVERY_TTL_MS,
  createRecoveryRateLimiter,
  hashRecoveryToken,
  requestPasswordRecovery,
  resetPasswordWithRecoveryToken,
  validatePasswordRecoveryToken,
  type PasswordRecoveryAccount,
  type PasswordRecoveryRepository
} from "../server/passwordRecovery.ts";

interface RecoveryRecord {
  tokenHash: string;
  account: PasswordRecoveryAccount;
  expiresAt: number;
  consumed: boolean;
}

class MemoryRecoveryRepository implements PasswordRecoveryRepository {
  accounts = new Map<string, PasswordRecoveryAccount>();
  tokens = new Map<string, RecoveryRecord>();
  passwords = new Map<string, string>();
  failWrites = false;
  private writeTail: Promise<void> = Promise.resolve();

  async findAccount(email: string): Promise<PasswordRecoveryAccount | null> {
    return this.accounts.get(email) || null;
  }

  async createToken(
    account: PasswordRecoveryAccount,
    tokenHash: string,
    expiresAt: string
  ): Promise<boolean> {
    if (this.failWrites) throw new Error("database write failed");
    this.tokens.set(tokenHash, {
      tokenHash,
      account: { ...account },
      expiresAt: new Date(expiresAt).getTime(),
      consumed: false
    });
    return true;
  }

  async isTokenValid(tokenHash: string): Promise<boolean> {
    const record = this.tokens.get(tokenHash);
    if (!record || record.consumed || record.expiresAt <= Date.now()) return false;
    return this.sameIdentity(record.account);
  }

  async consumeTokenAndUpdatePassword(
    tokenHash: string,
    passwordHash: string
  ): Promise<boolean> {
    if (this.failWrites) throw new Error("database write failed");
    const previous = this.writeTail;
    let release!: () => void;
    this.writeTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      const record = this.tokens.get(tokenHash);
      if (!record || record.consumed || record.expiresAt <= Date.now()) return false;
      if (!this.sameIdentity(record.account)) return false;

      this.passwords.set(record.account.email, passwordHash);
      for (const token of this.tokens.values()) {
        if (
          token.account.email === record.account.email &&
          token.account.schoolId === record.account.schoolId &&
          token.account.role === record.account.role &&
          token.account.teacherId === record.account.teacherId
        ) {
          token.consumed = true;
        }
      }
      return true;
    } finally {
      release();
    }
  }

  async deleteToken(tokenHash: string): Promise<void> {
    if (this.failWrites) throw new Error("database write failed");
    this.tokens.delete(tokenHash);
  }

  private sameIdentity(expected: PasswordRecoveryAccount): boolean {
    const current = this.accounts.get(expected.email);
    return !!current &&
      current.email === expected.email &&
      current.schoolId === expected.schoolId &&
      current.role === expected.role &&
      current.teacherId === expected.teacherId;
  }
}

function createAccount(): PasswordRecoveryAccount {
  return {
    email: "teacher@example.test",
    schoolId: "school-a",
    role: "teacher",
    teacherId: "teacher-1"
  };
}

function createDependencies(repository: MemoryRecoveryRepository, token: string) {
  const sent: Array<{ email: string; link: string }> = [];
  return {
    sent,
    dependencies: {
      repository,
      createToken: () => token,
      now: () => Date.now(),
      sendEmail: async (email: string, link: string) => {
        sent.push({ email, link });
        return true;
      }
    }
  };
}

test("valid request stores only a token hash and sends a short-lived reset link", async () => {
  const repository = new MemoryRecoveryRepository();
  const account = createAccount();
  const token = crypto.randomBytes(32).toString("base64url");
  repository.accounts.set(account.email, account);
  const { sent, dependencies } = createDependencies(repository, token);

  await requestPasswordRecovery(account.email, "https://app.example.test", dependencies);

  const tokenHash = hashRecoveryToken(token);
  assert.equal(repository.tokens.has(tokenHash), true);
  assert.equal(repository.tokens.has(token), false);
  assert.equal(JSON.stringify([...repository.tokens.values()]).includes(token), false);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].link, `https://app.example.test/reset-password#token=${encodeURIComponent(token)}`);
  const stored = repository.tokens.get(tokenHash);
  assert.ok(stored);
  assert.ok(stored.expiresAt - Date.now() <= PASSWORD_RECOVERY_TTL_MS);
  assert.ok(stored.expiresAt - Date.now() > PASSWORD_RECOVERY_TTL_MS - 1000);
});

test("known and unknown email requests have the same generic service outcome", async () => {
  const repository = new MemoryRecoveryRepository();
  const account = createAccount();
  repository.accounts.set(account.email, account);
  const { sent, dependencies } = createDependencies(repository, "opaque-test-token");
  const knownOutcome = await requestPasswordRecovery(account.email, "https://app.example.test", dependencies);
  const unknownOutcome = await requestPasswordRecovery("missing@example.test", "https://app.example.test", dependencies);

  assert.equal(knownOutcome, unknownOutcome);
  assert.equal(knownOutcome, undefined);
  assert.equal(sent.length, 1);
});

test("inactive or unregistered accounts do not receive recovery email", async () => {
  const repository = new MemoryRecoveryRepository();
  const { sent, dependencies } = createDependencies(repository, "opaque-test-token");

  await requestPasswordRecovery("disabled@example.test", "https://app.example.test", dependencies);

  assert.equal(sent.length, 0);
  assert.equal(repository.tokens.size, 0);
});

test("invalid and expired recovery tokens are rejected", async () => {
  const repository = new MemoryRecoveryRepository();
  const account = createAccount();
  repository.accounts.set(account.email, account);
  const token = "expired-test-token";
  await repository.createToken(account, hashRecoveryToken(token), new Date(Date.now() - 1).toISOString());

  assert.equal(await validatePasswordRecoveryToken("unknown-token", repository), false);
  assert.equal(await validatePasswordRecoveryToken(token, repository), false);
  assert.equal(await validatePasswordRecoveryToken("x".repeat(257), repository), false);
});

test("successful reset stores a scrypt hash and atomically consumes the token once", async () => {
  const repository = new MemoryRecoveryRepository();
  const account = createAccount();
  const token = "single-use-test-token";
  repository.accounts.set(account.email, account);
  await repository.createToken(account, hashRecoveryToken(token), new Date(Date.now() + 60_000).toISOString());
  const passwordHash = await hashPassword("somali-password-2026");

  const [first, concurrent] = await Promise.all([
    resetPasswordWithRecoveryToken(token, "somali-password-2026", "somali-password-2026", passwordHash, repository),
    resetPasswordWithRecoveryToken(token, "somali-password-2026", "somali-password-2026", passwordHash, repository)
  ]);

  assert.equal([first, concurrent].filter((result) => result.success).length, 1);
  assert.equal([first, concurrent].filter((result) => !result.success).length, 1);
  assert.equal(await repository.isTokenValid(hashRecoveryToken(token)), false);
  assert.deepEqual(repository.accounts.get(account.email), account);
  const reused = await resetPasswordWithRecoveryToken(
    token,
    "somali-password-2026",
    "somali-password-2026",
    passwordHash,
    repository
  );
  assert.equal(reused.success, false);
  const savedPasswordHash = repository.passwords.get(account.email);
  assert.ok(savedPasswordHash?.startsWith("scrypt$"));
  assert.deepEqual(await verifyPassword("somali-password-2026", savedPasswordHash!), {
    valid: true,
    needsRehash: false
  });
});

test("reset cannot cross a school or account identity change", async () => {
  const repository = new MemoryRecoveryRepository();
  const account = createAccount();
  const token = "school-bound-test-token";
  repository.accounts.set(account.email, account);
  await repository.createToken(account, hashRecoveryToken(token), new Date(Date.now() + 60_000).toISOString());
  repository.accounts.set(account.email, { ...account, schoolId: "school-b" });

  const result = await resetPasswordWithRecoveryToken(
    token,
    "somali-password-2026",
    "somali-password-2026",
    "scrypt$hash",
    repository
  );

  assert.equal(result.success, false);
  assert.equal(repository.passwords.size, 0);
  assert.equal(repository.tokens.get(hashRecoveryToken(token))?.consumed, false);
});

test("database write failures never report a successful password reset", async () => {
  const repository = new MemoryRecoveryRepository();
  const account = createAccount();
  const token = "failed-write-test-token";
  repository.accounts.set(account.email, account);
  await repository.createToken(account, hashRecoveryToken(token), new Date(Date.now() + 60_000).toISOString());
  repository.failWrites = true;

  await assert.rejects(() =>
    resetPasswordWithRecoveryToken(
      token,
      "somali-password-2026",
      "somali-password-2026",
      "scrypt$hash",
      repository
    )
  );
});

test("database lookup failures reject recovery requests instead of reporting success", async () => {
  const repository = new MemoryRecoveryRepository();
  repository.findAccount = async () => {
    throw new Error("database unavailable");
  };
  const { dependencies } = createDependencies(repository, "database-failure-token");

  await assert.rejects(() =>
    requestPasswordRecovery(
      "teacher@example.test",
      "https://app.example.test",
      dependencies
    )
  );
});

test("email delivery failure removes the stored recovery token", async () => {
  const repository = new MemoryRecoveryRepository();
  const account = createAccount();
  const token = "email-failure-test-token";
  repository.accounts.set(account.email, account);
  const dependencies = {
    repository,
    createToken: () => token,
    sendEmail: async () => false
  };

  await requestPasswordRecovery(account.email, "https://app.example.test", dependencies);

  assert.equal(repository.tokens.has(hashRecoveryToken(token)), false);
  assert.equal(repository.tokens.has(token), false);
});

test("thrown email delivery failures remove the recovery token and propagate", async () => {
  const repository = new MemoryRecoveryRepository();
  const account = createAccount();
  const token = "email-throw-test-token";
  repository.accounts.set(account.email, account);
  const dependencies = {
    repository,
    createToken: () => token,
    sendEmail: async () => {
      throw new Error("SMTP unavailable");
    }
  };

  await assert.rejects(() =>
    requestPasswordRecovery(account.email, "https://app.example.test", dependencies)
  );

  assert.equal(repository.tokens.has(hashRecoveryToken(token)), false);
});

test("recovery rate limits are independent for each IP, email, and token key", () => {
  const limiter = createRecoveryRateLimiter();
  assert.equal(limiter.consume("request:ip:one", 2, 60_000, 1_000).allowed, true);
  assert.equal(limiter.consume("request:ip:one", 2, 60_000, 2_000).allowed, true);
  assert.equal(limiter.consume("request:ip:one", 2, 60_000, 3_000).allowed, false);
  assert.equal(limiter.consume("request:email:one", 2, 60_000, 3_000).allowed, true);
  assert.equal(limiter.consume("token:value:one", 1, 60_000, 3_000).allowed, true);
  assert.equal(limiter.consume("token:value:one", 1, 60_000, 4_000).allowed, false);
  assert.equal(limiter.consume("token:value:one", 1, 60_000, 64_000).allowed, true);
});
