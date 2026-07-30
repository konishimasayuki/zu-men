/**
 * クリック作図（概形）から計画平面図を出す。
 *
 * 引数は「ピンの緯度 経度 系番号」と、ピンからの (北[m],東[m]) の並び。
 *   npx vite-node scripts/renderTrace.ts 33.2279338 130.4150011 2 9.32,-2.00 -4.33,10.16 ...
 *
 * **なぞった座標は測量成果ではない。** 図面に記入する面積は --area で渡す。
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildSceneFromTrace } from '../src/scenes/fromTrace';
import { toLonLat, toPlaneXY, zoneLabel } from '../src/geo/crs';
import type { ZoneNumber } from '../src/geo/crs';
import { buildPlanPdf, originCenteredOn, checkFit } from '../src/pdf/plan';
import { PAPER_SIZES } from '../src/paper/layout';
import { m2ToTsubo } from '../src/draw/tsubo';
import { loadMojGeoJson } from '../src/data/moj';

const OUT = resolve(import.meta.dirname, '../out');
mkdirSync(OUT, { recursive: true });
const font = new Uint8Array(readFileSync(resolve(import.meta.dirname, '../public/fonts/ipaexg.ttf')));

const argv = process.argv.slice(2);
const flag = (name: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const positional = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--')));

const lat = Number(positional[0]);
const lon = Number(positional[1]);
const zone = Number(positional[2]) as ZoneNumber;
const offsets = positional.slice(3).map((s) => s.split(',').map(Number) as [number, number]);
if (offsets.length < 3) throw new Error('ピンからの (北,東) を3点以上渡してください');

const pin = { lon, lat };
const center = toPlaneXY(pin, zone);
const trace = offsets.map(([n, e]) => toLonLat({ x: center.x + n, y: center.y + e }, zone));

const mojPath = flag('moj');
const neighbours = mojPath
  ? loadMojGeoJson(JSON.parse(readFileSync(mojPath, 'utf-8'))).parcels
  : [];

const registered = flag('area') ? Number(flag('area')) : undefined;

console.log(`ピン ${lat}, ${lon}　${zoneLabel(zone)}`);
console.log(`平面直角座標 X(北) ${center.x.toFixed(3)} / Y(東) ${center.y.toFixed(3)}`);
console.log(`なぞった頂点 ${trace.length}点　周辺の筆 ${neighbours.length}件を読み込み\n`);

for (const paperName of ['A4', 'A3'] as const) {
  const paper = PAPER_SIZES[paperName];
  const r = buildSceneFromTrace({
    trace, zone, center, paper, scaleDenominator: 250,
    chiban: flag('chiban'), chimoku: flag('chimoku') ?? '田', owner: flag('owner'),
    ...(registered !== undefined ? { registeredAreaM2: registered } : {}),
    neighbours,
    parking: { oneWay: flag('oneway') === 'true' },
    ...(flag('entrance') ? { entranceEdgeIndex: Number(flag('entrance')) } : {}),
    ...(flag('discharge') ? { dischargeEdgeIndex: Number(flag('discharge')) } : {}),
  });
  const fit = checkFit(r.scene, paper, 250);
  const pdf = await buildPlanPdf(r.scene, font, {
    paper, scaleDenominator: 250, origin: originCenteredOn(center, paper, 250),
  });
  const file = `計画平面図_作図_${paperName}.pdf`;
  writeFileSync(resolve(OUT, file), pdf);

  const n = (t: string) => r.scene.notes.filter((q) => q.text === t).length;
  console.log(`${paperName}:`);
  console.log(`  なぞった面積 ${r.tracedAreaM2.toFixed(1)}㎡（${m2ToTsubo(r.tracedAreaM2).toFixed(1)}坪）　外周 ${r.tracedPerimeterM.toFixed(1)}m`);
  console.log(`  図面に記入 ${r.drawnAreaM2.toFixed(1)}㎡（${m2ToTsubo(r.drawnAreaM2).toFixed(1)}坪）` +
    (r.areaGapRatio ? `　食い違い ${(r.areaGapRatio * 100).toFixed(1)}%` : ''));
  console.log(`  駐車区画 ${r.stallCount}台（帯${r.scene.bands.length}列・通路${n('通路')}）` +
    `　進入口${n('進入口')}・放流先${n('雨水放流先')}・桝${r.scene.basins.length}・矢印${r.scene.arrows.length}`);
  console.log(`  周辺 ${r.neighbours.length}筆　図面 ${fit.contentWidthM.toFixed(1)}×${fit.contentHeightM.toFixed(1)}m / 図郭 ${fit.frameWidthM.toFixed(1)}×${fit.frameHeightM.toFixed(1)}m`);
  console.log(`  ${file}（${pdf.length.toLocaleString()}バイト）`);
  if (paperName === 'A4') {
    console.log('  辺の一覧（進入口・放流先の選択肢）:');
    for (const e of r.edges) {
      console.log(`    辺${e.index}: 長さ${e.lengthM.toFixed(1)}m　隣 ${e.neighbourChiban ?? 'なし'}`);
    }
  }
}
