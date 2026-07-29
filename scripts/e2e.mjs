/**
 * ブラウザで実際に操作して確かめる。
 *
 *   npm run dev            # 別の端末で
 *   npm i --no-save playwright-core pngjs && node scripts/e2e.mjs
 *
 * 地理院への通信は stub する。目的はアプリ側の描画と画面遷移の確認であり、
 * 通信そのものは scripts/gsicheck.ts で実データに対して確かめている。
 */
import { chromium } from 'playwright-core';
import { PNG } from 'pngjs';
const OUT = process.env.E2E_OUT ?? '.';

// 地理院タイルの代わりに市松模様を返す。地図描画そのものを確かめるための stub。
function tile() {
  const png = new PNG({ width: 256, height: 256 });
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const i = (256 * y + x) << 2;
    const on = (((x >> 5) + (y >> 5)) & 1) === 0;
    png.data[i] = on ? 226 : 205; png.data[i+1] = on ? 232 : 216; png.data[i+2] = on ? 222 : 200; png.data[i+3] = 255;
  }
  return PNG.sync.write(png);
}
const TILE = tile();
const HIT = JSON.stringify([
  { geometry: { coordinates: [139.522232, 36.065834], type: 'Point' }, type: 'Feature',
    properties: { addressCode: '', title: '埼玉県鴻巣市' } },
  { geometry: { coordinates: [139.510330, 36.060890], type: 'Point' }, type: 'Feature',
    properties: { addressCode: '', title: '埼玉県鴻巣市本町' } },
]);

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const errors = [];
const page = await browser.newPage({ viewport: { width: 1000, height: 1150 } });
page.on('pageerror', e => errors.push('pageerror: ' + e.message + '\n' + (e.stack||'').split('\n').slice(0,6).join('\n')));
page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push('console: ' + m.text().slice(0, 160)); });

await page.route('**://cyberjapandata.gsi.go.jp/**', r => r.fulfill({ contentType: 'image/png', body: TILE }));
await page.route('**://msearch.gsi.go.jp/**', r => r.fulfill({ contentType: 'application/json', body: HIT }));

await page.goto('http://127.0.0.1:5177/', { waitUntil: 'domcontentloaded' });
await page.getByLabel('住所').fill('埼玉県鴻巣市');
await page.getByRole('button', { name: '住所を検索' }).click();

await page.waitForSelector('ul button', { timeout: 10000 });
console.log('検索候補:', await page.locator('ul button').count(), '件');
console.log('  1件目:', (await page.locator('ul button').first().innerText()).replace(/\s+/g, ' '));

await page.locator('ul button').first().click();
await page.waitForSelector('text=平面直角座標系の確認', { timeout: 10000 });
await page.waitForTimeout(3000);

console.log('\n選択中の系:', await page.locator('select').nth(1).inputValue());
console.log('地図キャンバス:', await page.locator('canvas.maplibregl-canvas').count() ? 'あり' : 'なし');
console.log('マーカー:', await page.locator('.maplibregl-marker').count() ? 'あり' : 'なし');
console.log('出典表示:', (await page.locator('.maplibregl-ctrl-attrib-inner').innerText().catch(() => '(なし)')).replace(/\s+/g,' '));
await page.screenshot({ path: `${OUT}/app.png`, fullPage: true });
console.log('エラー:', errors.length ? errors : 'なし');
await browser.close();
