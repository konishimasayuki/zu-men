/** 印刷補正の効きを実測して確認する。 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildStage0Pdf } from '../src/pdf/stage0';
import { readPageGeometry, closestSegmentLengthMm } from '../src/test/pdfInspect';

const fontBytes = new Uint8Array(readFileSync(resolve(import.meta.dirname, '../public/fonts/ipaexg.ttf')));

console.log('基準長200mm  実測値   補正倍率    20mの辺の描画長   そのプリンタで刷った結果');
for (const measured of [200, 198, 202, 195.5]) {
  const cal = measured === 200 ? undefined : { nominalMm: 200, measuredMm: measured };
  const geom = await readPageGeometry(await buildStage0Pdf(fontBytes, { calibration: cal }));
  const f = 200 / measured;
  const drawn = closestSegmentLengthMm(geom, 80 * f);
  const printed = drawn * (measured / 200);
  console.log(
    `             ${String(measured).padStart(6)}mm  ${f.toFixed(5)}   ${drawn.toFixed(4)}mm` +
    `        ${printed.toFixed(4)}mm   cm=${geom.nonIdentityCtmCount}`,
  );
}
