/**
 * 実データを使った動線をブラウザで通す。
 * 住所検索 → 登記所備付地図を読み込む → ピンをずらす → その筆の計画平面図が出る。
 */
import { chromium } from 'playwright-core';
import { PNG } from 'pngjs';
import { readFileSync } from 'node:fs';

const OUT = process.env.E2E_OUT ?? '.';
const PORT = process.env.E2E_PORT ?? '5179';
const FIXTURE = 'src/data/__fixtures__/moj_kounosu_sample.json';
/** 抜粋データの中心。ここにピンを置く。 */
const PIN = { lat: 36.09, lon: 139.472 };

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
    properties: { addressCode: '', title: '埼玉県鴻巣市' } },
]);

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const errors = [];
const page = await browser.newPage({ viewport: { width: 1000, height: 1200 } });
page.on('pageerror', e => errors.push('pageerror: ' + e.message.slice(0, 200)));
page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push('console: ' + m.text().slice(0, 160)); });
await page.route('**://cyberjapandata.gsi.go.jp/**', r => r.fulfill({ contentType: 'image/png', body: TILE }));
await page.route('**://msearch.gsi.go.jp/**', r => r.fulfill({ contentType: 'application/json', body: HIT }));

await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded' });

await page.getByLabel('住所').fill('埼玉県鴻巣市');
await page.getByRole('button', { name: '住所を検索' }).click();
await page.waitForSelector('ul button', { timeout: 10000 });
await page.locator('ul button').first().click();
await page.waitForSelector('text=平面直角座標系の確認', { timeout: 10000 });
console.log('1. 住所検索 → ピン設置        OK');

await page.getByLabel('登記所備付地図のGeoJSON').setInputFiles(FIXTURE);
await page.waitForSelector('text=読み込んだ筆数', { timeout: 30000 });
const summary = (await page.locator('text=読み込んだ筆数').locator('..').innerText()).replace(/\s+/g, ' ');
console.log('2. 地図データ読み込み          OK');
console.log('   ' + summary);

await page.waitForSelector('text=申請地:', { timeout: 10000 });
const subject = (await page.locator('text=申請地:').locator('..').innerText()).replace(/\n+/g, ' / ');
console.log('3. ピンが指す筆を申請地に      OK');
console.log('   ' + subject);

// 道路側・放流先の選択肢が出ているか（データからは判定できないので画面で選ばせる）
const entOpts = await page.locator('label:has-text("進入口を置く辺") select option').allInnerTexts();
const disOpts = await page.locator('label:has-text("雨水の放流先の辺") select option').allInnerTexts();
console.log('4. 進入口・放流先の辺を選べる  ' + (entOpts.length > 1 && disOpts.length > 1 ? 'OK' : '×'));
console.log('   進入口の候補: ' + entOpts.join(' ／ '));
// 既定以外の辺を選んで、図面が組み直せることを確かめる
await page.locator('label:has-text("雨水の放流先の辺") select').selectOption({ index: 2 });
await page.waitForTimeout(300);
const chosen = await page.locator('label:has-text("雨水の放流先の辺") select').inputValue();
console.log('5. 放流先を選び直せる          ' + (chosen !== '' ? 'OK（辺' + chosen + '）' : '×'));

const dl = page.waitForEvent('download', { timeout: 40000 });
await page.getByRole('button', { name: /この場所の計画平面図PDFを出力/ }).click();
const d = await dl;
const path = `${OUT}/plan_moj.pdf`;
await d.saveAs(path);
const bytes = readFileSync(path);
console.log(`6. PDF出力                     ${bytes.subarray(0,5).toString('latin1') === '%PDF-' ? 'OK' : '×'}  ${bytes.length.toLocaleString()}バイト`);

await page.screenshot({ path: `${OUT}/moj_flow.png`, fullPage: true });
console.log('エラー: ' + (errors.length ? errors.join('\n  ') : 'なし'));
await browser.close();
