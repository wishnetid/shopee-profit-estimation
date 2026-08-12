import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createBulkQueue, eligibleQueueItems, requeueFailedItems, summarizeQueue } = require('../lib/bulk-upload-queue.js');

function file(name, lastModified = Date.UTC(2026, 7, 12, 10, 30)) {
  return { name, size: 42, lastModified };
}

test('createBulkQueue keeps every supported file and rejects unsupported files without trusting file names for report type', () => {
  const queue = createBulkQueue([
    file('Order.all.20260801_20260812.xlsx'),
    file('tacticalized_adwords_bill_2026-08-12.csv'),
    file('notes.txt'),
  ]);

  assert.equal(queue.length, 3);
  assert.deepEqual(queue.map((item) => item.status), ['pending', 'pending', 'rejected']);
  assert.equal(queue[0].reportType, null);
  assert.equal(queue[1].reportType, null);
  assert.match(queue[2].error, /xlsx|xls|csv/i);
});

test('eligibleQueueItems selects only successful, importable, non-duplicate previews', () => {
  const queue = [
    { id: 'ready', selected: true, status: 'ready', preview: { canImport: true, duplicateHash: false } },
    { id: 'duplicate', selected: true, status: 'duplicate', preview: { canImport: false, duplicateHash: true } },
    { id: 'invalid', selected: true, status: 'invalid', preview: null },
    { id: 'unselected', selected: false, status: 'ready', preview: { canImport: true, duplicateHash: false } },
  ];

  assert.deepEqual(eligibleQueueItems(queue).map((item) => item.id), ['ready']);
});

test('requeueFailedItems reselects only failed importable previews without retrying unrelated ready files', () => {
  const retry = requeueFailedItems([
    { id: 'failed-importable', status: 'failed', selected: false, preview: { canImport: true, duplicateHash: false } },
    { id: 'failed-duplicate', status: 'failed', selected: false, preview: { canImport: false, duplicateHash: true } },
    { id: 'ready', status: 'ready', selected: true, preview: { canImport: true, duplicateHash: false } },
  ]);

  assert.deepEqual(retry.map((item) => [item.id, item.status, item.selected]), [
    ['failed-importable', 'ready', true],
    ['failed-duplicate', 'failed', false],
    ['ready', 'ready', true],
  ]);
});

test('summarizeQueue separates queue state from transaction rows', () => {
  const summary = summarizeQueue([
    { status: 'ready', selected: true, preview: { totalRows: 10 } },
    { status: 'ready', selected: false, preview: { totalRows: 5 } },
    { status: 'duplicate', selected: false, preview: { totalRows: 10 } },
    { status: 'invalid', selected: false, preview: null },
    { status: 'pending', selected: false, preview: null },
  ]);

  assert.deepEqual(summary, {
    total: 5,
    pending: 1,
    checking: 0,
    ready: 2,
    duplicate: 1,
    invalid: 1,
    rejected: 0,
    importing: 0,
    imported: 0,
    failed: 0,
    selected: 1,
    selectedRows: 10,
  });
});
