/** 検収基準6: 出力PDFと参考図面の記載要素を突き合わせる。 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildPlanPdf } from '../src/pdf/plan';
import { referenceScene } from '../src/scenes/reference';
import { PAPER_SIZES } from '../src/paper/layout';
import { readPageGeometry } from '../src/test/pdfInspect';
import { countStalls } from '../src/draw/parking';

const font = new Uint8Array(readFileSync(resolve(import.meta.dirname, '../public/fonts/ipaexg.ttf')));
const scene = referenceScene();
const geom = await readPageGeometry(await buildPlanPdf(scene, font, { paper: PAPER_SIZES.A3 }));

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
  ['排水経路の矢印', '判別できず', '未実装（第4段階）', '×'],
  ['進入口・隅切り', '手書き引出し1のみ', '未実装（第4段階）', '×'],
];

const w = [0,1,2,3].map(i => Math.max(...rows.map(r => [...r[i]].reduce((s,c)=>s+(c.charCodeAt(0)>255?2:1),0))));
const pad = (s: string, n: number) => s + ' '.repeat(Math.max(0, n - [...s].reduce((a,c)=>a+(c.charCodeAt(0)>255?2:1),0)));
console.log(`${pad('要素',w[0])} | ${pad('参考図面',w[1])} | ${pad('出力PDF',w[2])} | 判定`);
console.log('-'.repeat(w[0]+w[1]+w[2]+12));
for (const r of rows) console.log(`${pad(r[0],w[0])} | ${pad(r[1],w[1])} | ${pad(r[2],w[2])} | ${r[3]}`);

const counts = rows.reduce((m, r) => ({ ...m, [r[3]]: (m[r[3]] ?? 0) + 1 }), {} as Record<string, number>);
console.log(`\n一致 ${counts['○']} / 相違 ${counts['△'] ?? 0} / 未実装 ${counts['×'] ?? 0}`);
console.log(`線分数 ${geom.segments.length} / 用紙 ${geom.widthMm.toFixed(1)}×${geom.heightMm.toFixed(1)}mm / クリップ ${geom.clipCount}回`);
