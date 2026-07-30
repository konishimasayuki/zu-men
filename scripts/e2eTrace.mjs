/**
 * クリック作図の動線をブラウザで通す。
 * 住所検索 → 「地図をクリックして作図する」→ 地図を5点クリック →
 * 登記簿面積を入れる → その場所の計画平面図PDFが出る。
 *
 *   npm run dev -- --port 5180
 *   node scripts/e2eTrace.mjs
 */
import { chromium } from 'playwright-core';
import { PNG } from 'pngjs';
import { readFileSync } from 'node:fs';

const OUT = process.env.E2E_OUT ?? '.';
const PORT = process.env.E2E_PORT ?? '5180';
/** 依頼者から受けた座標（福岡県大川市大字下林）。 */
const PIN = { lat: 33.2279338, lon: 130.4150011 };
const ADDR = '福岡県大川市';

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
  { geometry: { coordinates: [PIN.lon, PIN.lat], type: 'Point' }, type: 'Feature',
    properties: { addressCode: '', title: ADDR } },
]);

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const errors = [];
const page = await browser.newPage({ viewport: { width: 1000, height: 1400 } });
page.on('pageerror', e => errors.push('pageerror: ' + e.message.slice(0, 200)));
page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push('console: ' + m.text().slice(0, 160)); });
await page.route('**://cyberjapandata.gsi.go.jp/**', r => r.fulfill({ contentType: 'image/png', body: TILE }));
await page.route('**://msearch.gsi.go.jp/**', r => r.fulfill({ contentType: 'application/json', body: HIT }));

await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded' });

await page.getByLabel('住所').fill(ADDR);
await page.getByRole('button', { name: '住所を検索' }).click();
await page.waitForSelector('ul button', { timeout: 10000 });
await page.locator('ul button').first().click();
await page.waitForSelector('text=平面直角座標系の確認', { timeout: 10000 });
console.log('1. 住所検索 → ピン設置            OK');

await page.getByText('地図をクリックして作図する').click();
await page.waitForSelector('text=申請地の角をなぞってください', { timeout: 10000 });
console.log('2. クリック作図モードに切り替え    OK');

// 作図用の地図（2つ目のMapView）の中心から相対位置でクリックする
const canvases = page.locator('canvas.maplibregl-canvas');
const map = canvases.nth(await canvases.count() - 1);
await map.scrollIntoViewIfNeeded();
await page.waitForTimeout(1500);
const box = await map.boundingBox();
const cx = box.x + box.width / 2;
const cy = box.y + box.height / 2;
// ピンを囲む五角形。ズーム18なので1px ≒ 0.5m。
const offsets = [[-20, -80], [70, -30], [70, 40], [-80, 60], [-50, -40]];
for (const [dx, dy] of offsets) {
  await page.mouse.click(cx + dx, cy + dy);
  await page.waitForTimeout(250);
}
const vertexLine = await page.locator('text=頂点').first().innerText();
console.log(`3. 地図を${offsets.length}点クリック           OK  ${vertexLine.replace(/\s+/g, ' ').slice(0, 90)}`);

await page.getByRole('button', { name: '90坪' }).click();
await page.waitForTimeout(300);
const summary = (await page.locator('text=図面に記入する面積').last().innerText()).replace(/\s+/g, ' ');
console.log('4. 登記簿面積に90坪を入れる        OK');
console.log('   ' + summary.slice(0, 140));

const entOpts = await page.locator('label:has-text("進入口を置く辺") select option').allInnerTexts();
console.log(`5. 進入口の辺を選べる              ${entOpts.length > 1 ? 'OK' : '×'}  ${entOpts.length - 1}辺`);

const dl = page.waitForEvent('download', { timeout: 40000 });
await page.getByRole('button', { name: /この場所の計画平面図PDFを出力/ }).click();
const d = await dl;
const path = `${OUT}/plan_trace.pdf`;
await d.saveAs(path);
const bytes = readFileSync(path);
console.log(`6. PDF出力                         ${bytes.subarray(0,5).toString('latin1') === '%PDF-' ? 'OK' : '×'}  ${bytes.length.toLocaleString()}バイト`);

await page.screenshot({ path: `${OUT}/trace_flow.png`, fullPage: true });
console.log('エラー: ' + (errors.length ? errors.join('\n  ') : 'なし'));
await browser.close();
