/**
 * ゴールの動線をブラウザで通す。
 * 住所を検索 → ピンをずらす → その場所の計画平面図PDFが出る。
 *
 *   npm run dev
 *   npm i --no-save playwright-core pngjs && node scripts/e2ePlan.mjs
 *
 * 地理院への通信は stub する（この環境のブラウザは外に出られないため）。
 */
import { chromium } from 'playwright-core';
import { PNG } from 'pngjs';
import { readFileSync } from 'node:fs';

const OUT = process.env.E2E_OUT ?? '.';
const PORT = process.env.E2E_PORT ?? '5178';

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
]);

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const errors = [];
const page = await browser.newPage({ viewport: { width: 1000, height: 1000 } });
page.on('pageerror', e => errors.push('pageerror: ' + e.message.slice(0, 200)));
page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push('console: ' + m.text().slice(0, 160)); });

await page.route('**://cyberjapandata.gsi.go.jp/**', r => r.fulfill({ contentType: 'image/png', body: TILE }));
await page.route('**://msearch.gsi.go.jp/**', r => r.fulfill({ contentType: 'application/json', body: HIT }));

await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded' });

// 1. 住所を検索
await page.getByLabel('住所').fill('埼玉県鴻巣市');
await page.getByRole('button', { name: '住所を検索' }).click();
await page.waitForSelector('ul button', { timeout: 10000 });
await page.locator('ul button').first().click();
await page.waitForSelector('text=平面直角座標系の確認', { timeout: 10000 });
console.log('1. 住所検索 → 選択  OK');

// 2. 地図をクリックしてピンをずらす
const canvas = page.locator('canvas.maplibregl-canvas');
const box = await canvas.boundingBox();
const before = await page.locator('text=平面直角座標:').innerText();
await canvas.click({ position: { x: box.width * 0.62, y: box.height * 0.40 } });
await page.waitForTimeout(1200);
const after = await page.locator('text=平面直角座標:').innerText();
console.log('2. ピンをずらす      ' + (before !== after ? 'OK（座標が変わった）' : '×（座標が変わらない）'));
console.log('   ずらす前: ' + before.replace(/\s+/g, ' '));
console.log('   ずらす後: ' + after.replace(/\s+/g, ' '));

// 3. その場所の計画平面図PDFを出す
await page.getByRole('button', { name: '143坪' }).click();
const dl = page.waitForEvent('download', { timeout: 30000 });
await page.getByRole('button', { name: /この場所の計画平面図PDFを出力/ }).click();
const download = await dl;
const path = `${OUT}/plan_from_pin.pdf`;
await download.saveAs(path);
const bytes = readFileSync(path);
const isPdf = bytes.subarray(0, 5).toString('latin1') === '%PDF-';
// ヘッドレスChromiumは download 属性の日本語ファイル名を落とすため、
// 名前ではなく中身で確かめる（実ブラウザでは日本語名がそのまま付く）。
console.log(`3. PDF出力           ${isPdf ? 'OK' : '×'}  ${bytes.length.toLocaleString()}バイト  先頭 ${bytes.subarray(0,5).toString('latin1')}`);

console.log('\n収まり判定: ' + (await page.locator('text=/収まります|収まりません/').first().innerText()).replace(/\s+/g,' '));
await page.screenshot({ path: `${OUT}/plan_flow.png`, fullPage: true });
console.log('エラー: ' + (errors.length ? errors.join('\n  ') : 'なし'));
await browser.close();
