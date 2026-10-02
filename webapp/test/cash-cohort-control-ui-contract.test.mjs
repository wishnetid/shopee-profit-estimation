import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const profitPagePath = new URL('../app/profit/page.tsx', import.meta.url);
const panelPath = new URL('../components/CashCohortControlPanel.tsx', import.meta.url);

test('Profit page exposes additive per-store Kontrol Kas Cohort without changing existing Profit tabs', async () => {
  const source = await readFile(profitPagePath, 'utf8');
  const panel = await readFile(panelPath, 'utf8');

  assert.match(source, /CashCohortControlPanel/);
  assert.match(source, /Kontrol Kas Cohort/);
  assert.match(source, /setTab\('cashControl'\)/);
  assert.match(source, /tab === 'cashControl'/);
  assert.match(panel, /\/api\/cash-cohort-control/);
  assert.match(panel, /Cash Siap Tarik/);
  assert.match(panel, /Running Potential/);
  assert.match(panel, /Gross Top-up Ads \+ PPN/);
  assert.match(panel, /PPN sudah termasuk/);
  assert.match(panel, /Estimasi Belum Cair/);
  assert.match(panel, /Coverage Source RAW/);
  assert.match(panel, /Running control/);
  assert.doesNotMatch(panel, /Used Ads Cost.*Cash Siap Tarik/);
});

// Keep the mobile surface bounded: source coverage is horizontally scrollable
// instead of forcing financial labels/amounts to overflow the viewport.
test('Cash Cohort Control keeps its source table horizontally bounded', async () => {
  const panel = await readFile(panelPath, 'utf8');
  assert.match(panel, /overflow-x-auto/);
  assert.match(panel, /min-w-\[620px\]/);
});
