import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const pagePath = path.resolve(process.cwd(), 'app/upload/page.tsx');

test('bulk upload UI accepts multiple files and folder selection instead of silently taking files[0]', () => {
  const source = fs.readFileSync(pagePath, 'utf8');
  assert.match(source, /multiple/);
  assert.match(source, /directoryInputProps/);
  assert.match(source, /\.\.\.directoryInputProps/);
  assert.match(source, /queueFiles\(/);
  assert.doesNotMatch(source, /if \(files\.length > 0\) pickFile\(files\[0\]\)/);
});

test('bulk upload UI previews before selected import and preserves per-file preview ticket', () => {
  const source = fs.readFileSync(pagePath, 'utf8');
  assert.match(source, /action', 'preview'/);
  assert.match(source, /eligibleQueueItems/);
  assert.match(source, /preview_ticket/);
  assert.match(source, /queue.*status.*imported|status: 'imported'/s);
  assert.match(source, /requeueFailedItems/);
  assert.match(source, /Retry Gagal/);
  assert.match(source, /Bulk Preview/);
  assert.match(source, /Import Selected/);
});

test('bulk upload UI resets its queue when the active store changes', () => {
  const source = fs.readFileSync(pagePath, 'utf8');
  assert.match(source, /setBulkQueue\(\[\]\)/);
  assert.match(source, /bulkRequestRef\.current \+= 1/);
});

test('bulk upload Cancel invalidates active requests and clears the whole queue synchronously', () => {
  const source = fs.readFileSync(pagePath, 'utf8');
  const resetBody = source.match(/const reset = \(\) => \{([\s\S]*?)\n  \};/);
  assert.ok(resetBody, 'reset handler must exist');
  assert.match(resetBody[1], /bulkRequestRef\.current \+= 1/);
  assert.match(resetBody[1], /setBulkQueue\(\[\]\)/);
  assert.match(resetBody[1], /setBulkStoreId\(null\)/);
  assert.match(resetBody[1], /setBulkRunning\(false\)/);
});
