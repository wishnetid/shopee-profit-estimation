import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import dashboardAuth from '../lib/dashboard-auth.js';

const require = createRequire(import.meta.url);
const { NextRequest } = require('next/server');
const createJiti = require('jiti');
const jiti = createJiti(fileURLToPath(import.meta.url), { interopDefault: true });

const {
  DASHBOARD_SESSION_COOKIE,
  createDashboardSessionToken,
  isDashboardSessionAuthorized,
  isMutationAuthorized,
} = dashboardAuth;

const env = {
  DASHBOARD_BASIC_AUTH_USER: 'yogaimawan',
  DASHBOARD_BASIC_AUTH_PASSWORD: 'password-rahasia',
};

const issuedAt = 1_700_000_000;

test('signed dashboard session accepts its own cookie and rejects tampering or expiry', () => {
  const token = createDashboardSessionToken(env, issuedAt);
  const cookieHeader = `${DASHBOARD_SESSION_COOKIE}=${token}`;

  assert.equal(isDashboardSessionAuthorized(cookieHeader, env, issuedAt + 60), true);
  assert.equal(isMutationAuthorized(null, cookieHeader, env, issuedAt + 60), true);
  assert.equal(isDashboardSessionAuthorized(`${DASHBOARD_SESSION_COOKIE}=${token}x`, env, issuedAt + 60), false);
  assert.equal(isDashboardSessionAuthorized(cookieHeader, env, issuedAt + (15 * 24 * 60 * 60)), false);
});

test('proxy redirects unauthenticated pages to custom login instead of triggering browser Basic Auth', async () => {
  const proxyPath = new URL('../proxy.ts', import.meta.url);
  const source = await readFile(proxyPath, 'utf8');

  assert.match(source, /DASHBOARD_SESSION_COOKIE/);
  assert.match(source, /new URL\('\/login'/);
  assert.match(source, /NextResponse\.redirect\(loginUrl\)/);
  assert.match(source, /\/api\/auth\//);
  assert.doesNotMatch(source, /WWW-Authenticate/);
});

test('proxy preserves credentialed API access without reintroducing a browser Basic Auth popup', async () => {
  const proxyPath = new URL('../proxy.ts', import.meta.url);
  const source = await readFile(proxyPath, 'utf8');

  assert.match(source, /function isBasicApiAuthorized/);
  assert.match(source, /pathname\.startsWith\('\/api\/'\) && isBasicApiAuthorized\(request\)/);
  assert.doesNotMatch(source, /WWW-Authenticate/);
});

test('login route validates credentials, sets an HTTP-only session, and never returns a Basic Auth challenge', async () => {
  const loginRoutePath = new URL('../app/api/auth/login/route.ts', import.meta.url);
  const source = await readFile(loginRoutePath, 'utf8');

  assert.match(source, /isValidDashboardCredentials/);
  assert.match(source, /createDashboardSessionToken/);
  assert.match(source, /response\.cookies\.set/);
  assert.match(source, /httpOnly:\s*true/);
  assert.match(source, /sameSite:\s*'lax'/);
  assert.match(source, /secure:\s*process\.env\.NODE_ENV === 'production'/);
  assert.doesNotMatch(source, /WWW-Authenticate/);
});

test('login route is displayed without the application navigation shell', async () => {
  const appFramePath = new URL('../components/AppFrame.tsx', import.meta.url);
  const source = await readFile(appFramePath, 'utf8');

  assert.match(source, /usePathname/);
  assert.match(source, /pathname === '\/login'/);
  assert.match(source, /StoreProvider/);
});

test('login page provides a branded credential form with safe redirect handling', async () => {
  const loginPagePath = new URL('../app/login/page.tsx', import.meta.url);
  const loginFormPath = new URL('../components/LoginForm.tsx', import.meta.url);
  const [pageSource, formSource] = await Promise.all([
    readFile(loginPagePath, 'utf8'),
    readFile(loginFormPath, 'utf8'),
  ]);

  assert.match(pageSource, /LoginForm/);
  assert.match(formSource, /Masuk ke Shopee Profit/);
  assert.match(formSource, /autoComplete="username"/);
  assert.match(formSource, /autoComplete="current-password"/);
  assert.match(formSource, /\/api\/auth\/login/);
  assert.match(formSource, /safeNextPath/);
  assert.match(formSource, /role="alert"/);
});

test('login redirect guards reject browser backslash URL normalization tricks', async () => {
  const loginRoutePath = new URL('../app/api/auth/login/route.ts', import.meta.url);
  const loginFormPath = new URL('../components/LoginForm.tsx', import.meta.url);
  const [routeSource, formSource] = await Promise.all([
    readFile(loginRoutePath, 'utf8'),
    readFile(loginFormPath, 'utf8'),
  ]);

  assert.match(routeSource, /path\.includes\('\\\\'\)/);
  assert.match(formSource, /next\.includes\('\\\\'\)/);
});

test('login route rejects control-character redirects and non-object JSON before property access', async () => {
  const loginRoutePath = new URL('../app/api/auth/login/route.ts', import.meta.url);
  const source = await readFile(loginRoutePath, 'utf8');

  assert.match(source, /new URL\(path, request\.nextUrl\.origin\)/);
  assert.match(source, /normalizeRedirectPathname\(target\.pathname\)/);
  assert.match(source, /if \(!payload \|\| typeof payload !== 'object' \|\| Array\.isArray\(payload\)\)/);
});

test('login route fails closed for control-character next values and non-object JSON payloads', async () => {
  const { POST } = jiti('../app/api/auth/login/route.ts');
  const originalUser = process.env.DASHBOARD_BASIC_AUTH_USER;
  const originalPassword = process.env.DASHBOARD_BASIC_AUTH_PASSWORD;
  process.env.DASHBOARD_BASIC_AUTH_USER = 'review-user';
  process.env.DASHBOARD_BASIC_AUTH_PASSWORD = 'review-password';

  try {
    const headers = { origin: 'https://dashboard.example.test', 'content-type': 'application/json' };
    const controlRequest = new NextRequest('https://dashboard.example.test/api/auth/login', {
      method: 'POST',
      headers,
      body: JSON.stringify({ username: 'review-user', password: 'review-password', next: '/\\n/evil.example' }),
    });
    const controlResponse = await POST(controlRequest);
    assert.equal(controlResponse.status, 200);
    assert.equal((await controlResponse.json()).redirectTo, '/');

    for (const next of ['/%5c%5cevil.example', '/%2f%2fevil.example', '/%0d%0a//evil.example', '/%252f%252fevil.example']) {
      const encodedRequest = new NextRequest('https://dashboard.example.test/api/auth/login', {
        method: 'POST',
        headers,
        body: JSON.stringify({ username: 'review-user', password: 'review-password', next }),
      });
      const encodedResponse = await POST(encodedRequest);
      assert.equal(encodedResponse.status, 200);
      assert.equal((await encodedResponse.json()).redirectTo, '/');
    }

    const primitiveRequest = new NextRequest('https://dashboard.example.test/api/auth/login', {
      method: 'POST',
      headers,
      body: JSON.stringify(null),
    });
    const primitiveResponse = await POST(primitiveRequest);
    assert.equal(primitiveResponse.status, 400);
  } finally {
    if (originalUser === undefined) delete process.env.DASHBOARD_BASIC_AUTH_USER;
    else process.env.DASHBOARD_BASIC_AUTH_USER = originalUser;
    if (originalPassword === undefined) delete process.env.DASHBOARD_BASIC_AUTH_PASSWORD;
    else process.env.DASHBOARD_BASIC_AUTH_PASSWORD = originalPassword;
  }
});

test('mutation routes preserve same-origin session protection while allowing trusted Basic API clients', async () => {
  const routePaths = [
    '../app/api/stores/route.ts',
    '../app/api/settings/database/route.ts',
    '../app/api/upload/route.ts',
  ];

  for (const relativePath of routePaths) {
    const source = await readFile(new URL(relativePath, import.meta.url), 'utf8');
    assert.match(source, /request\.headers\.get\('cookie'\)/);
    assert.match(source, /isValidBasicAuthorization/);
    assert.match(source, /!basicApiAuthorized && !isSameOriginMutation/);
  }
});

test('store and settings mutation routes reject null, arrays, and primitive JSON before property access', async () => {
  const routePaths = [
    '../app/api/stores/route.ts',
    '../app/api/settings/database/route.ts',
  ];

  for (const relativePath of routePaths) {
    const source = await readFile(new URL(relativePath, import.meta.url), 'utf8');
    assert.match(source, /!payload \|\| typeof payload !== 'object' \|\| Array\.isArray\(payload\)/);
  }
});
