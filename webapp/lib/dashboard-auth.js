const crypto = require('crypto');

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_UPLOAD_EXTENSIONS = new Set(['.xlsx', '.xls', '.csv']);
const ALLOWED_UPLOAD_MIME_TYPES = new Set([
  '',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
  'application/csv',
  'application/octet-stream',
]);

const DASHBOARD_SESSION_COOKIE = 'shopee_profit_session';
const DASHBOARD_SESSION_TTL_SECONDS = 12 * 60 * 60;
const SESSION_TOKEN_VERSION = 'v1';

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function unixNow() {
  return Math.floor(Date.now() / 1000);
}

function hasDashboardCredentials(env = process.env) {
  return Boolean(env.DASHBOARD_BASIC_AUTH_USER && env.DASHBOARD_BASIC_AUTH_PASSWORD);
}

function sessionSecret(env = process.env) {
  return env.DASHBOARD_SESSION_SECRET || env.DASHBOARD_BASIC_AUTH_PASSWORD || '';
}

function signDashboardSession(payload, env = process.env) {
  const secret = sessionSecret(env);
  if (!secret) return '';
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

function cookieValue(cookieHeader, name) {
  if (typeof cookieHeader !== 'string') return null;
  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

function isValidDashboardCredentials(username, password, env = process.env) {
  if (!hasDashboardCredentials(env) || typeof username !== 'string' || typeof password !== 'string') return false;
  return safeEqual(username, env.DASHBOARD_BASIC_AUTH_USER)
    && safeEqual(password, env.DASHBOARD_BASIC_AUTH_PASSWORD);
}

function isValidBasicAuthorization(authorization, expectedUsername, expectedPassword) {
  if (!authorization || !expectedUsername || !expectedPassword || !authorization.startsWith('Basic ')) return false;

  try {
    const decoded = Buffer.from(authorization.slice(6), 'base64').toString('utf8');
    const separator = decoded.indexOf(':');
    if (separator < 0) return false;

    const username = decoded.slice(0, separator);
    const password = decoded.slice(separator + 1);
    return safeEqual(username, expectedUsername) && safeEqual(password, expectedPassword);
  } catch {
    return false;
  }
}

function createDashboardSessionToken(env = process.env, issuedAt = unixNow()) {
  if (!hasDashboardCredentials(env)) return '';
  const normalizedIssuedAt = Math.floor(Number(issuedAt));
  if (!Number.isSafeInteger(normalizedIssuedAt) || normalizedIssuedAt <= 0) return '';

  const expiresAt = normalizedIssuedAt + DASHBOARD_SESSION_TTL_SECONDS;
  const payload = `${SESSION_TOKEN_VERSION}.${normalizedIssuedAt}.${expiresAt}`;
  const signature = signDashboardSession(payload, env);
  return signature ? `${payload}.${signature}` : '';
}

function isDashboardSessionAuthorized(cookieHeader, env = process.env, now = unixNow()) {
  if (!hasDashboardCredentials(env)) return false;
  const token = cookieValue(cookieHeader, DASHBOARD_SESSION_COOKIE);
  if (!token) return false;

  const parts = token.split('.');
  if (parts.length !== 4) return false;
  const [version, issuedAtRaw, expiresAtRaw, signature] = parts;
  const issuedAt = Number(issuedAtRaw);
  const expiresAt = Number(expiresAtRaw);
  const normalizedNow = Math.floor(Number(now));

  if (
    version !== SESSION_TOKEN_VERSION
    || !Number.isSafeInteger(issuedAt)
    || !Number.isSafeInteger(expiresAt)
    || !Number.isSafeInteger(normalizedNow)
    || issuedAt <= 0
    || expiresAt !== issuedAt + DASHBOARD_SESSION_TTL_SECONDS
    || issuedAt > normalizedNow + 300
    || expiresAt <= normalizedNow
  ) return false;

  const expectedSignature = signDashboardSession(`${version}.${issuedAt}.${expiresAt}`, env);
  return Boolean(expectedSignature) && safeEqual(signature, expectedSignature);
}

// Read-only dashboard access uses the signed session cookie. Basic credentials
// remain accepted for trusted non-browser clients that already call mutation APIs.
function isMutationAuthorized(authorization, cookieOrEnv = null, maybeEnv = process.env, now = unixNow()) {
  const cookieHeader = typeof cookieOrEnv === 'string' ? cookieOrEnv : null;
  const env = cookieOrEnv && typeof cookieOrEnv === 'object' ? cookieOrEnv : maybeEnv;
  if (!hasDashboardCredentials(env)) return false;

  return isDashboardSessionAuthorized(cookieHeader, env, now)
    || isValidBasicAuthorization(
      authorization,
      env.DASHBOARD_BASIC_AUTH_USER,
      env.DASHBOARD_BASIC_AUTH_PASSWORD,
    );
}

function isSameOriginMutation(origin, expectedOrigin) {
  return typeof origin === 'string' && origin === expectedOrigin;
}

function validateUploadFile(file) {
  if (!file || typeof file.name !== 'string' || !Number.isFinite(file.size)) {
    return { valid: false, error: 'File upload tidak valid.' };
  }

  const extension = file.name.includes('.') ? `.${file.name.split('.').pop().toLowerCase()}` : '';
  if (!ALLOWED_UPLOAD_EXTENSIONS.has(extension)) {
    return { valid: false, error: 'Hanya file Excel .xlsx/.xls atau CSV .csv yang diizinkan.' };
  }
  if (file.size <= 0) return { valid: false, error: 'File Excel kosong.' };
  if (file.size > MAX_UPLOAD_BYTES) {
    return { valid: false, error: `Ukuran file melebihi batas ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.` };
  }
  if (!ALLOWED_UPLOAD_MIME_TYPES.has(file.type || '')) {
    return { valid: false, error: 'Tipe file tidak diizinkan.' };
  }

  return { valid: true, error: null };
}

module.exports = {
  DASHBOARD_SESSION_COOKIE,
  DASHBOARD_SESSION_TTL_SECONDS,
  createDashboardSessionToken,
  hasDashboardCredentials,
  isDashboardSessionAuthorized,
  isMutationAuthorized,
  isSameOriginMutation,
  isValidBasicAuthorization,
  isValidDashboardCredentials,
  validateUploadFile,
};
