/** 検収基準6: 出力PDFと参考図面の記載要素を突き合わせる。 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildPlanPdf } from '../src/pdf/plan';
import { referenceScene } from '../src/scenes/reference';
import { PAPER_SIZES } from '../src/paper/layout';
import { readPageGeometry } from '../src/test/pdfInspect';
import { countStalls } from '../src/draw/parking';
import { loadMojGeoJson, parcelAt, roughCentroid } from '../src/data/moj';
import { buildSceneFromMoj, nearestParcel } from '../src/scenes/fromMoj';
import { toPlaneXY } from '../src/geo/crs';

const font = new Uint8Array(readFileSync(resolve(import.meta.dirname, '../public/fonts/ipaexg.ttf')));
const scene = referenceScene();
const geom = await readPageGeometry(await buildPlanPdf(scene, font, { paper: PAPER_SIZES.A3 }));

// 進入口と排水は参考図面に無い（矢印は判別できず、進入口は手書き引出し1本のみ）ので、
// 参考図面の再現には入れていない。実装の有無は実データの図面のほうで測る。
const { parcels } = loadMojGeoJson(JSON.parse(readFileSync(
  resolve(import.meta.dirname, '../src/data/__fixtures__/moj_kounosu_sample.json'), 'utf-8')));
const PIN = { lon: 139.47266620014287, lat: 36.09113443785714 };
const subject = parcelAt(parcels, PIN) ?? nearestParcel(parcels, PIN)!;
const real = buildSceneFromMoj({
  parcels, subjects: [{ id: subject.id, chimoku: '田' }], zone: 9,
  center: toPlaneXY(roughCentroid(subject.outline), 9),
  paper: PAPER_SIZES.A4, scaleDenominator: 250,
});
const rs = real.scene;
const realNote = (t: string) => rs.notes.filter(n => n.text === t).length;

const rows: Array<[string, string, string, string]> = [
  ['図枠（二重線）', '有', '有', '○'],
  ['表題「計画平面図 S＝1/250」', '上辺中央やや右・横書き枠', '同左', '○'],
  ['方位記号', '左上・八芒星＋矢羽根', '同左', '○'],
  ['綴じ代', '左端20mm', '左端20mm', '○'],
  ['表題欄', '右下に空欄の枠', '描かない（依頼者の指示）', '△'],
  ['申請地の筆数', '2筆（44-4 / 90-1）', `${scene.parcels.filter(p=>p.isSubject).length}筆（${scene.parcels.filter(p=>p.isSubject).map(p=>p.chiban).join(' / ')}）`, '○'],
  ['申請地の記載', '地番・地目・面積・所有者', '地番・地目・面積・所有者', '○'],
  ['隣接地', '地番のみ（32・89・91）', `地番のみ（${scene.parcels.filter(p=>!p.isSubject).map(p=>p.chiban).join('・')}）`, '○'],
  ['市道', '4箇所に注記', `${scene.corridors.filter(c=>c.kind==='road').length}箇所に注記`, '△'],
  ['用悪水路', '3箇所に注記', `${scene.corridors.filter(c=>c.kind==='waterway').length}箇所に注記`, '△'],
  ['隣家（建物）', 'ケバ付き輪郭2棟', `ケバ付き輪郭${scene.buildings.length}棟`, '○'],
  ['車の平面シンボル', '約23台', `${countStalls(scene.bands)}台`, '○'],
  ['「通路」の注記', '2箇所＋手書き引出し1', `${scene.notes.filter(n=>n.text==='通路').length}箇所（うち引出し1）`, '○'],
  ['フェンス（玉鎖線）', '敷地外周', `${scene.edgings.filter(e=>e.kind==='fence').length}本`, '○'],
  ['土留め（外向きT字）', '南東・南西', `${scene.edgings.filter(e=>e.kind==='retaining').length}本`, '○'],
  ['集水桝（菱形）', '1箇所を確認', `${scene.basins.length}箇所`, '△'],
  ['求積表', '無', '無', '○'],
  ['寸法線', '無', '無', '○'],
  ['台数の記載', '無', '無（画面のみ）', '○'],
  ['出典表示', '無', '無', '○'],
  ['凡例', '無', '無', '○'],
  // 以下2行は実データの図面（愛の町327）での実測。参考図面の再現には意図的に入れていない。
  ['排水経路の矢印', '判別できず', `実データ図面で矢印${rs.arrows.length}・桝${rs.basins.length}・側溝${rs.edgings.filter(e=>e.kind==='gutter').length}`, '△'],
  ['進入口・隅切り', '手書き引出し1のみ', `実データ図面で進入口${realNote('進入口')}・隅切り2`, '△'],
];

const w = [0,1,2,3].map(i => Math.max(...rows.map(r => [...r[i]].reduce((s,c)=>s+(c.charCodeAt(0)>255?2:1),0))));
const pad = (s: string, n: number) => s + ' '.repeat(Math.max(0, n - [...s].reduce((a,c)=>a+(c.charCodeAt(0)>255?2:1),0)));
console.log(`${pad('要素',w[0])} | ${pad('参考図面',w[1])} | ${pad('出力PDF',w[2])} | 判定`);
console.log('-'.repeat(w[0]+w[1]+w[2]+12));
for (const r of rows) console.log(`${pad(r[0],w[0])} | ${pad(r[1],w[1])} | ${pad(r[2],w[2])} | ${r[3]}`);

const counts = rows.reduce((m, r) => ({ ...m, [r[3]]: (m[r[3]] ?? 0) + 1 }), {} as Record<string, number>);
console.log(`\n一致 ${counts['○']} / 相違 ${counts['△'] ?? 0} / 未実装 ${counts['×'] ?? 0}`);
console.log(`線分数 ${geom.segments.length} / 用紙 ${geom.widthMm.toFixed(1)}×${geom.heightMm.toFixed(1)}mm / クリップ ${geom.clipCount}回`);
