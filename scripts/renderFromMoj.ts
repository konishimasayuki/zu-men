/** 実データ（登記所備付地図）から計画平面図を出す。検収基準5の確認を兼ねる。 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadMojGeoJson, summarise, parcelAt, roughCentroid, precisionNote } from '../src/data/moj';
import { buildSceneFromMoj, nearestParcel } from '../src/scenes/fromMoj';
import { toPlaneXY, zoneLabel } from '../src/geo/crs';
import { buildPlanPdf, originCenteredOn, checkFit } from '../src/pdf/plan';
import { PAPER_SIZES } from '../src/paper/layout';
import { m2ToTsubo } from '../src/draw/tsubo';

const OUT = resolve(import.meta.dirname, '../out');
mkdirSync(OUT, { recursive: true });
const font = new Uint8Array(readFileSync(resolve(import.meta.dirname, '../public/fonts/ipaexg.ttf')));

const path = process.argv[2] ?? resolve(import.meta.dirname, '../src/data/__fixtures__/moj_kounosu_sample.json');
const { name, parcels, skipped } = loadMojGeoJson(JSON.parse(readFileSync(path, 'utf-8')));
const s = summarise(parcels);

console.log(`データ: ${name}`);
console.log(`読み込んだ筆数: ${s.total}　（読み飛ばし: ${skipped.length ? JSON.stringify(skipped) : 'なし'}）`);
console.log(`市区町村: ${s.cities.join(', ')}　系: ${s.zones.map(zoneLabel).join(', ')}`);
console.log(`座標値種別: ${JSON.stringify(s.byCoordKind, null, 0)}`);
console.log(`精度区分  : ${JSON.stringify(s.byPrecision, null, 0)}`);
console.log(`求積に使える筆: ${s.usableForArea} / ${s.total}\n`);

const ZONE = s.zones[0] ?? 9;
const PIN = { lon: Number(process.argv[3] ?? 139.472), lat: Number(process.argv[4] ?? 36.09) };
const subject = parcelAt(parcels, PIN) ?? nearestParcel(parcels, PIN)!;
console.log(`ピン ${PIN.lat}, ${PIN.lon} → 申請地 ${subject.label}`);
console.log(`  ${precisionNote(subject)}`);

const center = toPlaneXY(roughCentroid(subject.outline), ZONE);
for (const paperName of ['A4', 'A3'] as const) {
  const paper = PAPER_SIZES[paperName];
  const r = buildSceneFromMoj({
    parcels, subjects: [{ id: subject.id, chimoku: '田', owner: '田中辰弘' }],
    zone: ZONE, center, paper, scaleDenominator: 250,
  });
  const fit = checkFit(r.scene, paper, 250);
  const pdf = await buildPlanPdf(r.scene, font, {
    paper, scaleDenominator: 250, origin: originCenteredOn(center, paper, 250),
  });
  const file = `計画平面図_実データ_${paperName}.pdf`;
  writeFileSync(resolve(OUT, file), pdf);
  const a = r.computedAreas[0];
  console.log(
    `\n${paperName}: 申請地1筆 + 周辺${r.neighbours.length}筆　` +
    `面積(座標法) ${a.areaM2.toFixed(1)}㎡ = ${m2ToTsubo(a.areaM2).toFixed(1)}坪`,
  );
  console.log(`     図面 ${fit.contentWidthM.toFixed(1)}×${fit.contentHeightM.toFixed(1)}m / 図郭 ${fit.frameWidthM.toFixed(1)}×${fit.frameHeightM.toFixed(1)}m`);
  console.log(`     ${file} (${pdf.length.toLocaleString()}バイト)`);
}
