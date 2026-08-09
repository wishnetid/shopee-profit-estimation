const crypto = require('crypto');

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_WORKBOOK_EXTENSIONS = new Set(['.xlsx', '.xls']);
const ALLOWED_WORKBOOK_MIME_TYPES = new Set([
  '',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/octet-stream',
]);

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
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

function hasDashboardCredentials(env = process.env) {
  return Boolean(env.DASHBOARD_BASIC_AUTH_USER && env.DASHBOARD_BASIC_AUTH_PASSWORD);
}

// Public mode applies only to read-only dashboard access. Mutations always
// require configured Basic Auth, including when DASHBOARD_AUTH_ENABLED=false.
function isMutationAuthorized(authorization, env = process.env) {
  if (!hasDashboardCredentials(env)) return false;
  return isValidBasicAuthorization(
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
  if (!ALLOWED_WORKBOOK_EXTENSIONS.has(extension)) {
    return { valid: false, error: 'Hanya file Excel .xlsx atau .xls yang diizinkan.' };
  }
  if (file.size <= 0) return { valid: false, error: 'File Excel kosong.' };
  if (file.size > MAX_UPLOAD_BYTES) {
    return { valid: false, error: `Ukuran file melebihi batas ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.` };
  }
  if (!ALLOWED_WORKBOOK_MIME_TYPES.has(file.type || '')) {
    return { valid: false, error: 'Tipe file tidak diizinkan.' };
  }

  return { valid: true, error: null };
}

module.exports = {
  hasDashboardCredentials,
  isMutationAuthorized,
  isSameOriginMutation,
  isValidBasicAuthorization,
  validateUploadFile,
};
