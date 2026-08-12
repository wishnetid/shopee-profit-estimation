const crypto = require('node:crypto');

function encode(payload) {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

function sign(encodedPayload, secret) {
  return crypto.createHmac('sha256', secret).update(encodedPayload).digest('base64url');
}

function createPreviewTicket({ storeId, sha256, reportType, now = Math.floor(Date.now() / 1000) }, secret, ttlSeconds = 15 * 60) {
  if (!secret || !Number.isSafeInteger(storeId) || !/^[a-f0-9]{64}$/i.test(sha256) || !reportType) {
    throw new Error('Preview ticket input is invalid.');
  }
  const payload = encode({ storeId, sha256: sha256.toLowerCase(), reportType, exp: now + ttlSeconds });
  return `${payload}.${sign(payload, secret)}`;
}

function verifyPreviewTicket(ticket, { storeId, sha256, reportType, now = Math.floor(Date.now() / 1000) }, secret) {
  if (!ticket || !secret || !Number.isSafeInteger(storeId) || !/^[a-f0-9]{64}$/i.test(sha256) || !reportType) {
    return { valid: false, error: 'Preview ticket tidak valid.' };
  }
  const [encodedPayload, signature, ...rest] = String(ticket).split('.');
  if (!encodedPayload || !signature || rest.length) return { valid: false, error: 'Preview ticket tidak valid.' };
  const expected = sign(encodedPayload, secret);
  const actual = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actual.length !== expectedBuffer.length || !crypto.timingSafeEqual(actual, expectedBuffer)) {
    return { valid: false, error: 'Preview ticket tidak valid.' };
  }
  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    if (payload.exp < now) return { valid: false, error: 'Preview telah kedaluwarsa. Jalankan preview ulang.' };
    if (payload.storeId !== storeId || payload.sha256 !== sha256.toLowerCase() || payload.reportType !== reportType) {
      return { valid: false, error: 'Preview tidak cocok dengan toko, file, atau tipe report.' };
    }
    return { valid: true, error: null };
  } catch {
    return { valid: false, error: 'Preview ticket tidak valid.' };
  }
}

module.exports = { createPreviewTicket, verifyPreviewTicket };
