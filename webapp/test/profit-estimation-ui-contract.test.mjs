import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const profitPagePath = new URL('../app/profit/page.tsx', import.meta.url);
const layoutPath = new URL('../app/layout.tsx', import.meta.url);

test('Profit page separates Estimasi Kotor from locked Profit Aktual and uses an explicit manual load action', async () => {
  const source = await readFile(profitPagePath, 'utf8');

  assert.match(source, /Profit & Estimasi/);
  assert.match(source, /Estimasi Kotor/);
  assert.match(source, /Profit Aktual/);
  assert.match(source, /Muat Estimasi/);
  assert.match(source, /\/api\/profit-estimation/);
  assert.match(source, /setData\(null\)/);
  assert.match(source, /requestSequence\.current/);
  assert.match(source, /const resetResult = useCallback\(\(\) => \{\s*requestSequence\.current \+= 1;\s*setData\(null\);\s*setError\(''\);\s*setPage\(1\);\s*setLoading\(false\);/);
  assert.match(source, /<ProfitEstimationContent\s+key=\{storeId \|\| 'no-store'\}/);
  assert.match(source, /function ProfitEstimationContent\(/);
  assert.match(source, /Sisa Estimasi Setelah Ads/);
  assert.match(source, /HPP Belum Lengkap/);
  assert.match(source, /Angka ini bukan Profit Bersih/);
  assert.doesNotMatch(source, /label="Profit Bersih"/);
});

test('primary navigation calls the existing Profit route Profit & Estimasi instead of adding a second global menu', async () => {
  const source = await readFile(layoutPath, 'utf8');

  assert.match(source, /<NavLink href="\/profit" icon=\{BarChart3\}>\s*Profit & Estimasi\s*<\/NavLink>/);
  assert.match(source, /<MobileNavLink href="\/profit" icon=\{BarChart3\} label="Estimasi"/);
  assert.doesNotMatch(source, /href="\/estimasi"/);
});
