import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const storeContextPath = new URL('../components/StoreContext.tsx', import.meta.url);
const profitPagePath = new URL('../app/profit/page.tsx', import.meta.url);

test('workspace switcher uses an in-app workspace popover and keeps add-store inside it', async () => {
  const source = await readFile(storeContextPath, 'utf8');

  assert.match(source, /aria-label="Pilih workspace toko"/);
  assert.match(source, /aria-haspopup="dialog"/);
  assert.match(source, /Workspace aktif/);
  assert.match(source, /Income package/);
  assert.match(source, /role="dialog"/);
  assert.match(source, /Tambah toko baru/);
  assert.match(source, /setStoreId\(String\(store\.id\)\)/);
  assert.doesNotMatch(source, /<select[\s\S]*id="active-store"/);
  assert.doesNotMatch(source, /semua upload baru masuk ke toko ini/);
});

test('Profit page relies on global workspace context instead of repeating a store-active badge', async () => {
  const source = await readFile(profitPagePath, 'utf8');

  assert.match(source, /Monitoring estimasi kotor seller, HPP, dan Ads untuk \{activeStoreName\}/);
  assert.doesNotMatch(source, />Toko aktif: \{activeStoreName\}</);
});
