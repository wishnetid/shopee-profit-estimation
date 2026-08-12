import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const routePath = path.resolve(process.cwd(), 'app/api/upload/route.ts');

test('all queue-supported report types issue a preview ticket and require its matching ticket before import', () => {
  const source = fs.readFileSync(routePath, 'utf8');

  assert.match(source, /const sha256 = computeSha256\(buffer\);/);
  assert.match(source, /const previewTicket = preview\.canImport\s*\? createPreviewTicket\(\{ storeId, sha256, reportType \}, previewTicketSecret\(\)\)\s*:\s*null;/);
  assert.match(source, /previewTicket, \.\.\.preview/);
  assert.match(source, /const ticketCheck = verifyPreviewTicket\(\s*typeof formData\.get\('preview_ticket'\)/s);
  assert.match(source, /\{ storeId, sha256, reportType \}/);
  assert.match(source, /ticketCheck\.valid/);
});
