import test from 'node:test';
import assert from 'node:assert/strict';

import dashboardAuth from '../lib/dashboard-auth.js';

const {
  hasDashboardCredentials,
  isMutationAuthorized,
  isSameOriginMutation,
  isValidBasicAuthorization,
  validateUploadFile,
} = dashboardAuth;

function basic(username, password) {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

test('mutation authorization remains required when read-only auth is disabled', () => {
  const env = {
    DASHBOARD_AUTH_ENABLED: 'false',
    DASHBOARD_BASIC_AUTH_USER: 'yogaimawan',
    DASHBOARD_BASIC_AUTH_PASSWORD: 'password-rahasia',
  };
  assert.equal(hasDashboardCredentials(env), true);
  assert.equal(isMutationAuthorized(basic('yogaimawan', 'password-rahasia'), env), true);
  assert.equal(isMutationAuthorized(null, env), false);
  assert.equal(isMutationAuthorized(basic('yogaimawan', 'salah'), env), false);
  assert.equal(isMutationAuthorized(basic('yogaimawan', 'password-rahasia'), {}), false);
});

test('isValidBasicAuthorization accepts matching username and password', () => {
  assert.equal(
    isValidBasicAuthorization(basic('yogaimawan', 'password-rahasia'), 'yogaimawan', 'password-rahasia'),
    true,
  );
});

test('isValidBasicAuthorization rejects malformed or wrong credentials', () => {
  assert.equal(isValidBasicAuthorization(null, 'yogaimawan', 'password-rahasia'), false);
  assert.equal(isValidBasicAuthorization('Bearer abc', 'yogaimawan', 'password-rahasia'), false);
  assert.equal(isValidBasicAuthorization(basic('yogaimawan', 'salah'), 'yogaimawan', 'password-rahasia'), false);
  assert.equal(isValidBasicAuthorization(basic('orang-lain', 'password-rahasia'), 'yogaimawan', 'password-rahasia'), false);
});

test('isSameOriginMutation accepts same-origin browser requests and rejects cross-origin requests', () => {
  assert.equal(isSameOriginMutation('https://app.example.test', 'https://app.example.test'), true);
  assert.equal(isSameOriginMutation(null, 'https://app.example.test'), false);
  assert.equal(isSameOriginMutation('https://evil.example.test', 'https://app.example.test'), false);
});

test('validateUploadFile permits only supported workbook types within the configured size limit', () => {
  assert.deepEqual(
    validateUploadFile({ name: 'Order.all.xlsx', size: 1024, type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    { valid: true, error: null },
  );
  assert.equal(validateUploadFile({ name: 'payload.exe', size: 1024, type: 'application/octet-stream' }).valid, false);
  assert.equal(validateUploadFile({ name: 'Order.all.xlsx', size: 11 * 1024 * 1024, type: '' }).valid, false);
});
