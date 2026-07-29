/** 参考図面の再現シーンを描いて out/ に出す。 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildPlanPdf, checkFit } from '../src/pdf/plan';
import { referenceScene } from '../src/scenes/reference';
import { PAPER_SIZES } from '../src/paper/layout';
import { countStalls } from '../src/draw/parking';
import { area } from '../src/geo/area';

const OUT = resolve(import.meta.dirname, '../out');
mkdirSync(OUT, { recursive: true });
const fontBytes = new Uint8Array(readFileSync(resolve(import.meta.dirname, '../public/fonts/ipaexg.ttf')));

const scene = referenceScene();
for (const name of ['A4', 'A3'] as const) {
  const paper = PAPER_SIZES[name];
  const fit = checkFit(scene, paper, 250);
  const pdf = await buildPlanPdf(scene, fontBytes, { paper });
  writeFileSync(resolve(OUT, `参考図面再現_${name}.pdf`), pdf);
  console.log(
    `${name}: 図面 ${fit.contentWidthM.toFixed(1)}×${fit.contentHeightM.toFixed(1)}m / ` +
    `図郭 ${fit.frameWidthM.toFixed(1)}×${fit.frameHeightM.toFixed(1)}m → ` +
    `${fit.fits ? '収まる' : '収まらない（提案: ' + (fit.suggestion?.name ?? 'なし') + '）'}  ${pdf.length.toLocaleString()}バイト`,
  );
}
console.log('台数:', countStalls(scene.bands));
for (const p of scene.parcels.filter((p) => p.isSubject)) {
  console.log(`  ${p.chiban}: 記載 ${p.areaM2}㎡ / 座標法 ${area(p.outline).toFixed(1)}㎡`);
}
