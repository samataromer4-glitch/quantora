import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relativePath) {
  const file = path.join(root, relativePath);
  if (!fs.existsSync(file)) throw new Error(`Password recovery contract failed: missing ${relativePath}`);
  return fs.readFileSync(file, "utf8");
}

function assertContains(content, value, label) {
  if (!content.includes(value)) {
    throw new Error(`Password recovery contract failed: ${label}`);
  }
}

function assertNotContains(content, value, label) {
  if (content.includes(value)) {
    throw new Error(`Password recovery contract failed: ${label}`);
  }
}

const server = read("server.ts");
const recovery = read("server/passwordRecovery.ts");
const email = read("server/emailService.ts");
const session = read("server/authSession.ts");
const ui = read("src/features/auth/PasswordRecoveryPage.tsx");
const authUi = read("src/features/auth/AuthView.tsx");
const routeConfig = read("src/app/routeConfig.ts");
const migration = read("supabase/migrations/20261029090000_secure_password_recovery.sql");
const tests = read("tests/password-recovery.test.ts");
const deployment = read("docs/PASSWORD_RECOVERY.md");
const envExample = read(".env.example");

assertContains(server, 'app.post("/api/auth/password-recovery"', "recovery request endpoint is registered");
assertContains(server, 'app.post("/api/auth/password-recovery/validate"', "token validation endpoint is registered");
assertContains(server, 'app.post("/api/auth/password-reset"', "password reset endpoint is registered");
assertContains(server, 'return res.status(410).json({', "unimplemented email verification cannot report success");
assertContains(server, "Xaqiijinta email-ka weli lama hawlgelin", "verification endpoint explains that proof is not configured");
assertNotContains(server, "Verification step is disabled. Automated success.", "verification endpoint never fakes success");
assertContains(server, "PASSWORD_RECOVERY_GENERIC_RESPONSE", "request endpoint uses a generic response");
assertContains(server, '`request:ip:${ip}`', "recovery requests have per-IP rate limits");
assertContains(server, '`request:email:${emailKey}`', "recovery requests have per-email flood limits");
assertContains(server, '`token:ip:${ip}`', "token validation has per-IP rate limits");
assertContains(server, '`token:value:${tokenKey}`', "token guessing has per-token rate limits");
assertContains(server, 'getCanonicalAppUrl()', "recovery links use the configured canonical APP_URL");
assertContains(server, 'p_school_id: account.schoolId', "recovery token is bound to the account school");
assertContains(server, "persistLocalRecoveryDB(next)", "local recovery commits atomically to durable storage");
assertContains(server, 'session_version: Number(localUser.session_version) || 0', "local sessions carry an account version");
assertContains(server, 'select("email, school_id, role, teacher_id, session_version")', "cloud sessions verify the authoritative account version");

assertContains(recovery, 'crypto.randomBytes(32).toString("base64url")', "tokens are cryptographically random");
assertContains(recovery, 'createHash("sha256")', "only a SHA-256 token digest is persisted");
assertContains(recovery, "PASSWORD_RECOVERY_TTL_MS = 20 * 60 * 1000", "recovery tokens have a short expiry");
assertContains(recovery, "validatePassword(password)", "reset enforces the shared password policy");
assertNotContains(recovery, "localStorage", "recovery tokens are never stored in browser local storage");

assertContains(email, "sendPasswordRecoveryEmail", "recovery email uses the existing SMTP service");
assertContains(email, "getEmailTransporter()", "email delivery respects existing SMTP configuration");
assertContains(email, "Password recovery email delivery failed.", "delivery failures are logged without including secret data");
assertNotContains(email, "no-reply@dugsigapro.edu", "sender never falls back to an invented address");
assertNotContains(email, "[Activation Link]:", "invitation tokens are not logged");
assertContains(envExample, 'SUPABASE_PUBLISHABLE_KEY="your_supabase_publishable_key"', "environment template names the publishable key");
assertContains(envExample, 'EMAIL_USER=""', "environment template documents the legacy email username alias");
assertContains(envExample, 'EMAIL_PASS=""', "environment template documents the legacy email password alias");
const envAssignments = envExample
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("#"));
assert.ok(
  envAssignments.every((line) => /^[A-Z][A-Z0-9_]*\s*=/.test(line)),
  "environment template has no malformed variable assignments"
);
const envNames = envAssignments.map((line) => line.match(/^([A-Z][A-Z0-9_]*)\s*=/)[1]);
assert.equal(new Set(envNames).size, envNames.length, "environment template has no duplicate variables");

assertContains(migration, "token_hash TEXT NOT NULL UNIQUE", "database stores unique token digests");
assertContains(migration, "ENABLE ROW LEVEL SECURITY", "recovery-token table enables row-level security");
assertContains(migration, "FROM PUBLIC, anon, authenticated", "public and user roles cannot access recovery data or RPCs");
assertContains(migration, "FOR UPDATE", "token consumption uses row locking");
assertContains(migration, "pg_advisory_xact_lock", "per-account writes serialize concurrent recovery operations");
assertContains(migration, "session_version = COALESCE(u.session_version, 0) + 1", "reset revokes all previous account sessions");
assertContains(migration, "teacher_id IS NOT DISTINCT FROM v_recovery.teacher_id", "reset preserves teacher account identity");
assertContains(migration, "u.school_id = v_recovery.school_id", "reset is tenant-scoped in the atomic database update");

assertContains(session, "sessionVersion?: number", "signed sessions contain a password-reset version");
assertContains(server, "Furaha gelitaanku wuu dhacay", "stale sessions are rejected and must reauthenticate");
assertContains(authUi, "Ma illowday erayga sirta ah?", "login includes the Somali recovery link");
assertContains(ui, "Haddii cinwaanka email-ku ku xiran yahay akoon firfircoon", "recovery response does not reveal account existence");
assertContains(recovery, "#token=", "email link carries the token in a fragment, not a server request URL");
assertContains(ui, "password-recovery/validate", "reset page validates token before accepting a new password");
assertContains(routeConfig, "'reset-password'", "reset page has a dedicated app route");

for (const label of [
  "known and unknown email requests have the same generic service outcome",
  "invalid and expired recovery tokens are rejected",
  "successful reset stores a scrypt hash and atomically consumes the token once",
  "reset cannot cross a school or account identity change",
  "database write failures never report a successful password reset",
  "email delivery failure removes the stored recovery token",
  "recovery rate limits are independent"
]) {
  assertContains(tests, label, `automated security test exists: ${label}`);
}

assertContains(deployment, "20261029090000_secure_password_recovery.sql", "deployment steps name the reviewed migration");
assertContains(deployment, "APP_URL", "deployment steps require the canonical application URL");
assertContains(deployment, "SMTP", "deployment steps document existing email settings");
assertContains(read("scripts/server-smoke.mjs"), "recoveryWhileDatabaseUnavailable", "runtime smoke test covers unavailable recovery storage");

console.log("Password recovery security contract checks: PASS");
