import crypto from "crypto";
import { validatePassword } from "./authSession.ts";

export const PASSWORD_RECOVERY_TTL_MS = 20 * 60 * 1000;

export interface PasswordRecoveryAccount {
  email: string;
  schoolId: string;
  role: string;
  teacherId: string | null;
}

export interface PasswordRecoveryRepository {
  findAccount(email: string): Promise<PasswordRecoveryAccount | null>;
  createToken(
    account: PasswordRecoveryAccount,
    tokenHash: string,
    expiresAt: string
  ): Promise<boolean>;
  isTokenValid(tokenHash: string): Promise<boolean>;
  consumeTokenAndUpdatePassword(
    tokenHash: string,
    passwordHash: string
  ): Promise<boolean>;
  deleteToken(tokenHash: string): Promise<void>;
}

export interface PasswordRecoveryDependencies {
  repository: PasswordRecoveryRepository;
  sendEmail(email: string, recoveryLink: string): Promise<boolean>;
  now?: () => number;
  createToken?: () => string;
}

export function hashRecoveryToken(token: string): string {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

export function createRecoveryRateLimiter() {
  const buckets = new Map<string, { count: number; resetAt: number }>();
  let lastCleanupAt = 0;

  return {
    consume(key: string, maxAttempts: number, windowMs: number, now = Date.now()) {
      if (now - lastCleanupAt >= 60_000) {
        for (const [bucketKey, bucket] of buckets) {
          if (bucket.resetAt <= now) buckets.delete(bucketKey);
        }
        lastCleanupAt = now;
      }

      const current = buckets.get(key);
      if (!current || current.resetAt <= now) {
        if (!current && buckets.size >= 50_000) {
          return { allowed: false, retryAfterSeconds: Math.ceil(windowMs / 1000) };
        }
        buckets.set(key, { count: 1, resetAt: now + windowMs });
        return { allowed: true, retryAfterSeconds: Math.ceil(windowMs / 1000) };
      }

      current.count += 1;
      return {
        allowed: current.count <= maxAttempts,
        retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000))
      };
    }
  };
}

export async function requestPasswordRecovery(
  email: string,
  recoveryUrl: string,
  dependencies: PasswordRecoveryDependencies
): Promise<void> {
  const cleanEmail = email.trim().toLowerCase();
  const account = await dependencies.repository.findAccount(cleanEmail);
  if (!account) return;

  const token = (dependencies.createToken || (() => crypto.randomBytes(32).toString("base64url")))();
  const tokenHash = hashRecoveryToken(token);
  const now = (dependencies.now || Date.now)();
  const expiresAt = new Date(now + PASSWORD_RECOVERY_TTL_MS).toISOString();
  const created = await dependencies.repository.createToken(account, tokenHash, expiresAt);
  if (!created) return;

  const link = `${recoveryUrl.replace(/\/+$/, "")}/reset-password#token=${encodeURIComponent(token)}`;
  let delivered = false;
  try {
    delivered = await dependencies.sendEmail(cleanEmail, link);
  } finally {
    if (!delivered) {
      await dependencies.repository.deleteToken(tokenHash);
    }
  }
}

export async function validatePasswordRecoveryToken(
  token: string,
  repository: PasswordRecoveryRepository
): Promise<boolean> {
  if (!token || token.length > 256) return false;
  return repository.isTokenValid(hashRecoveryToken(token));
}

export async function resetPasswordWithRecoveryToken(
  token: string,
  password: string,
  confirmPassword: string,
  passwordHash: string,
  repository: PasswordRecoveryRepository
): Promise<{ success: boolean; error?: string }> {
  if (!token || token.length > 256) {
    return { success: false, error: "Link-ga dib-u-dejintu ma shaqaynayo ama wuu dhacay." };
  }
  if (password !== confirmPassword) {
    return { success: false, error: "Labada eray-sireed isma laha. Fadlan mar kale hubi." };
  }

  const passwordValidation = validatePassword(password);
  if (!passwordValidation.valid) {
    return { success: false, error: passwordValidation.error };
  }

  const success = await repository.consumeTokenAndUpdatePassword(
    hashRecoveryToken(token),
    passwordHash
  );
  return success
    ? { success: true }
    : { success: false, error: "Link-ga dib-u-dejintu ma shaqaynayo ama wuu dhacay. Codso link cusub." };
}
