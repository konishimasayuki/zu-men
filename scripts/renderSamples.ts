/** 依頼者の対象地の規模で、A4横・1/250 の計画平面図を出す。 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildPlanPdf, checkFit } from '../src/pdf/plan';
import { makeSampleScene, SAMPLE_90, SAMPLE_143 } from '../src/scenes/sample';
import { PAPER_SIZES } from '../src/paper/layout';
import { countStalls } from '../src/draw/parking';
import { boundsOf } from '../src/draw/scene';
import { area } from '../src/geo/area';
import { formatTsuboWithM2 } from '../src/draw/tsubo';

const OUT = resolve(import.meta.dirname, '../out');
mkdirSync(OUT, { recursive: true });
const font = new Uint8Array(readFileSync(resolve(import.meta.dirname, '../public/fonts/ipaexg.ttf')));

for (const spec of [SAMPLE_90, SAMPLE_143]) {
  const scene = makeSampleScene(spec);
  const fit = checkFit(scene, PAPER_SIZES.A4, 250);
  const b = boundsOf(scene)!;
  const site = scene.parcels.find((p) => p.isSubject)!;
  const pdf = await buildPlanPdf(scene, font, { paper: PAPER_SIZES.A4, scaleDenominator: 250 });
  const name = `計画平面図_${spec.tsubo}坪_A4_1-250.pdf`;
  writeFileSync(resolve(OUT, name), pdf);
  console.log(`■ ${formatTsuboWithM2(spec.tsubo)}  地番${site.chiban}`);
  console.log(`   敷地の座標法面積 ${area(site.outline).toFixed(1)}㎡（記入値 ${site.areaM2}㎡）`);
  console.log(`   図面全体 ${b.widthM.toFixed(1)}×${b.heightM.toFixed(1)}m / A4図郭 ${fit.frameWidthM.toFixed(1)}×${fit.frameHeightM.toFixed(1)}m`);
  console.log(`   → ${fit.fits ? 'A4に収まる' : 'A4に収まらない（提案: ' + fit.suggestion?.name + '）'}`);
  console.log(`   駐車 ${countStalls(scene.bands)}台 / ${name} (${pdf.length.toLocaleString()}バイト)\n`);
}
