import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const ADMIN_PATH = path.join(DATA_DIR, 'admin.json');

interface AdminRecord {
  username: string;
  salt: string;
  hash: string;
  sessionVersion: number;
  createdAt: string;
  updatedAt?: string;
}

const EPHEMERAL_SECRET = crypto.randomBytes(32).toString('hex');
const REVOKED_JTIS = new Map<string, number>();
const LOGIN_FAILURES = new Map<string, { count: number; firstAt: number; lockedUntil: number }>();

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 5;

function getSigningSecret(): string {
  return process.env.SESSION_SECRET || EPHEMERAL_SECRET;
}

function timingSafeStringEqual(aStr: string, bStr: string): boolean {
  const a = Buffer.from(aStr, 'utf-8');
  const b = Buffer.from(bStr, 'utf-8');
  if (a.length !== b.length) {
    // Burn constant-time work against dummy buffer to avoid length timing leaks
    crypto.timingSafeEqual(a, Buffer.alloc(a.length));
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

function writeAdminAtomic(record: AdminRecord): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  }
  const tmpPath = `${ADMIN_PATH}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(record, null, 2), { encoding: 'utf-8', mode: 0o600 });
  fs.renameSync(tmpPath, ADMIN_PATH);
}

function readAdminRecord(): AdminRecord | null {
  if (!fs.existsSync(ADMIN_PATH)) return null;
  try {
    const raw = fs.readFileSync(ADMIN_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<AdminRecord>;
    if (parsed.salt && parsed.hash) {
      return {
        username: (parsed.username && parsed.username.trim()) || 'admin',
        salt: parsed.salt,
        hash: parsed.hash,
        sessionVersion: typeof parsed.sessionVersion === 'number' ? parsed.sessionVersion : 1,
        createdAt: parsed.createdAt || new Date().toISOString(),
        updatedAt: parsed.updatedAt,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function getCurrentSessionVersion(): number {
  if (process.env.ADMIN_PASSCODE && process.env.ADMIN_PASSCODE.trim().length > 0) {
    return 1;
  }
  return readAdminRecord()?.sessionVersion ?? 1;
}

export function getAdminAuthStatus(): {
  configured: boolean;
  mode: 'env' | 'claimed' | 'unclaimed';
  requiresUsername: boolean;
} {
  if (process.env.ADMIN_PASSCODE && process.env.ADMIN_PASSCODE.trim().length > 0) {
    return { configured: true, mode: 'env', requiresUsername: true };
  }
  const record = readAdminRecord();
  if (record) {
    return { configured: true, mode: 'claimed', requiresUsername: true };
  }
  return { configured: false, mode: 'unclaimed', requiresUsername: true };
}

export function isValidAdminUsername(username: string): boolean {
  return /^[a-zA-Z0-9_.-]{3,40}$/.test(username.trim());
}

export function claimAdminPasscode(
  passcode: string,
  username: string = 'admin'
): { ok: boolean; error?: string } {
  const status = getAdminAuthStatus();
  if (status.mode !== 'unclaimed') {
    return { ok: false, error: 'حساب مدیریت قبلاً تنظیم شده است.' };
  }
  const cleanUser = typeof username === 'string' ? username.trim() : '';
  if (!isValidAdminUsername(cleanUser)) {
    return {
      ok: false,
      error: 'نام کاربری مدیریت باید بین ۳ تا ۴۰ کاراکتر انگلیسی (حروف، اعداد یا _ . -) باشد.',
    };
  }
  if (typeof passcode !== 'string' || passcode.trim().length < 8 || passcode.length > 128) {
    return { ok: false, error: 'گذرواژه مدیریت باید بین ۸ تا ۱۲۸ کاراکتر باشد.' };
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(passcode, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
  const record: AdminRecord = {
    username: cleanUser.toLowerCase(),
    salt,
    hash: derived,
    sessionVersion: 1,
    createdAt: new Date().toISOString(),
  };

  writeAdminAtomic(record);
  return { ok: true };
}

export function updateAdminCredentials(
  newPasscode: string,
  newUsername?: string
): { ok: boolean; error?: string } {
  if (process.env.ADMIN_PASSCODE && process.env.ADMIN_PASSCODE.trim().length > 0) {
    return {
      ok: false,
      error: 'گذرواژه از طریق متغیر محیطی سرور (Secrets) تنظیم شده و از اینجا قابل تغییر نیست.',
    };
  }
  const current = readAdminRecord();
  if (!current) {
    return { ok: false, error: 'ابتدا حساب مدیریت را تنظیم کنید.' };
  }
  const nextUser =
    newUsername && newUsername.trim().length > 0 ? newUsername.trim().toLowerCase() : current.username;
  if (!isValidAdminUsername(nextUser)) {
    return {
      ok: false,
      error: 'نام کاربری باید بین ۳ تا ۴۰ کاراکتر انگلیسی مجاز باشد.',
    };
  }
  if (typeof newPasscode !== 'string' || newPasscode.trim().length < 8 || newPasscode.length > 128) {
    return { ok: false, error: 'گذرواژه جدید باید حداقل ۸ کاراکتر باشد.' };
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto
    .scryptSync(newPasscode, salt, 64, { N: 16384, r: 8, p: 1 })
    .toString('hex');

  writeAdminAtomic({
    username: nextUser,
    salt,
    hash: derived,
    sessionVersion: current.sessionVersion + 1,
    createdAt: current.createdAt,
    updatedAt: new Date().toISOString(),
  });
  return { ok: true };
}

export function verifyAdminCredentials(passcode: string, username: string = 'admin'): boolean {
  if (typeof passcode !== 'string' || !passcode || passcode.length > 128) return false;
  const cleanUser = typeof username === 'string' ? username.trim().toLowerCase() : '';
  if (!cleanUser) return false;

  const envPass = process.env.ADMIN_PASSCODE?.trim();
  const envUser = (process.env.ADMIN_USERNAME?.trim() || 'admin').toLowerCase();
  if (envPass && envPass.length > 0) {
    const userOk = timingSafeStringEqual(cleanUser, envUser);
    const passOk = timingSafeStringEqual(passcode, envPass);
    return userOk && passOk;
  }

  const record = readAdminRecord();
  if (!record) return false;

  const userOk = timingSafeStringEqual(cleanUser, record.username.toLowerCase());
  const derived = crypto.scryptSync(passcode, record.salt, 64, { N: 16384, r: 8, p: 1 });
  const stored = Buffer.from(record.hash, 'hex');
  if (derived.length !== stored.length) return false;
  const passOk = crypto.timingSafeEqual(derived, stored);
  return userOk && passOk;
}

export function checkAdminLoginRateLimit(ip: string): { allowed: boolean; retryAfterSec?: number } {
  const now = Date.now();
  const rec = LOGIN_FAILURES.get(ip);
  if (!rec) return { allowed: true };
  if (rec.lockedUntil > now) {
    return { allowed: false, retryAfterSec: Math.ceil((rec.lockedUntil - now) / 1000) };
  }
  if (now - rec.firstAt > LOGIN_WINDOW_MS) {
    LOGIN_FAILURES.delete(ip);
    return { allowed: true };
  }
  return { allowed: true };
}

export function recordAdminLoginFailure(ip: string): void {
  const now = Date.now();
  const prev = LOGIN_FAILURES.get(ip);
  if (!prev || now - prev.firstAt > LOGIN_WINDOW_MS) {
    LOGIN_FAILURES.set(ip, { count: 1, firstAt: now, lockedUntil: 0 });
    return;
  }
  const nextCount = prev.count + 1;
  LOGIN_FAILURES.set(ip, {
    count: nextCount,
    firstAt: prev.firstAt,
    lockedUntil: nextCount >= MAX_LOGIN_ATTEMPTS ? now + LOGIN_LOCKOUT_MS : 0,
  });
}

export function clearAdminLoginFailures(ip: string): void {
  LOGIN_FAILURES.delete(ip);
}

export function issueAdminToken(): string {
  const payload = Buffer.from(
    JSON.stringify({
      role: 'admin',
      jti: crypto.randomUUID(),
      ver: getCurrentSessionVersion(),
      iat: Date.now(),
      exp: Date.now() + 1000 * 60 * 60 * 12,
    })
  ).toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSigningSecret())
    .update(payload)
    .digest('base64url');
  return `${payload}.${sig}`;
}

export function revokeAdminToken(token: string | undefined): void {
  if (!token) return;
  const parts = token.split('.');
  if (parts.length !== 2) return;
  try {
    const decoded = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf-8')) as {
      jti?: string;
      exp?: number;
    };
    if (decoded.jti && typeof decoded.exp === 'number') {
      REVOKED_JTIS.set(decoded.jti, decoded.exp);
      // Prune expired jtis
      const now = Date.now();
      for (const [k, exp] of REVOKED_JTIS.entries()) {
        if (exp <= now) REVOKED_JTIS.delete(k);
      }
    }
  } catch {
    // Ignore malformed token on logout
  }
}

export function verifyAdminToken(token: string | undefined): boolean {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [payload, sig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', getSigningSecret())
    .update(payload)
    .digest('base64url');

  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return false;
  }

  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8')) as {
      role?: string;
      jti?: string;
      ver?: number;
      exp?: number;
    };
    if (decoded.role !== 'admin') return false;
    if (typeof decoded.exp !== 'number' || decoded.exp <= Date.now()) return false;
    if (decoded.jti && REVOKED_JTIS.has(decoded.jti)) return false;
    if (decoded.ver !== getCurrentSessionVersion()) return false;
    return true;
  } catch {
    return false;
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined;
  if (!verifyAdminToken(token)) {
    res.status(401).json({ error: 'دسترسی غیرمجاز. لطفاً دوباره وارد پنل مدیریت شوید.' });
    return;
  }
  next();
}

export function issueSignedVoterToken(voterId: string): string {
  const payload = Buffer.from(JSON.stringify({ vid: voterId, iat: Date.now() })).toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSigningSecret())
    .update(`voter:${payload}`)
    .digest('base64url');
  return `${payload}.${sig}`;
}

export function verifySignedVoterToken(token: string | undefined): string | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', getSigningSecret())
    .update(`voter:${payload}`)
    .digest('base64url');

  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8')) as {
      vid?: string;
    };
    if (typeof parsed.vid === 'string' && /^[a-zA-Z0-9_-]{8,64}$/.test(parsed.vid)) {
      return parsed.vid;
    }
    return null;
  } catch {
    return null;
  }
}
