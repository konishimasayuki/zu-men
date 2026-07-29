/**
 * 生成PDFをファイルに書き出し、実測値を標準出力に報告する。
 *   npx vite-node scripts/emit.ts
 * 検収基準1の「Claude Code側」の数値はここで出る。
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildStage0Pdf, buildCalibrationPdf, VERIFICATION_SQUARE_SIDE_M } from '../src/pdf/stage0';
import { readPageGeometry, readEmbeddedFonts } from '../src/test/pdfInspect';
import { metersToPt, metersToPaperMm } from '../src/paper/transform';
import { area } from '../src/geo/area';
import { DEFAULT_PAPER, frameExtentMeters } from '../src/paper/layout';
import { verificationSquare } from '../src/pdf/stage0';

const OUT = resolve(import.meta.dirname, '../out');
mkdirSync(OUT, { recursive: true });

const fontBytes = new Uint8Array(readFileSync(resolve(import.meta.dirname, '../public/fonts/ipaexg.ttf')));

const plan = await buildStage0Pdf(fontBytes, {
  titleBlockRows: [
    { label: '会社名', value: '' },
    { label: '作成日', value: '' },
    { label: '作成者', value: '' },
  ],
});
const calib = await buildCalibrationPdf(fontBytes);

writeFileSync(resolve(OUT, '計画平面図_第0段階_A4.pdf'), plan);
writeFileSync(resolve(OUT, '縮尺検証シート_A4.pdf'), calib);

const geom = await readPageGeometry(plan);
const fonts = await readEmbeddedFonts(plan);
const expectedPt = metersToPt(VERIFICATION_SQUARE_SIDE_M);
const matches = geom.segments.filter((s) => Math.abs(s.lengthPt - expectedPt) <= 0.01);

const rows: Array<[string, string]> = [
  ['用紙', `${DEFAULT_PAPER.name}横`],
  ['用紙寸法', `${geom.widthMm.toFixed(4)} × ${geom.heightMm.toFixed(4)} mm （${geom.widthPt.toFixed(4)} × ${geom.heightPt.toFixed(4)} pt）`],
  ['図郭の実寸換算', `${frameExtentMeters(DEFAULT_PAPER, 250).widthM.toFixed(2)} m × ${frameExtentMeters(DEFAULT_PAPER, 250).heightM.toFixed(2)} m`],
  ['20mの辺の理論値', `${metersToPaperMm(20).toFixed(4)} mm / ${expectedPt.toFixed(4)} pt`],
  ['20mの辺の実測値', matches.length > 0 ? `${matches[0].lengthMm.toFixed(4)} mm / ${matches[0].lengthPt.toFixed(4)} pt` : '該当なし'],
  ['一致した辺の本数', `${matches.length} 本（正方形なので4本が期待値）`],
  ['最大誤差', matches.length > 0 ? `${Math.max(...matches.map((m) => Math.abs(m.lengthPt - expectedPt))).toExponential(3)} pt` : '—'],
  ['拡大縮小の座標変換', `${geom.nonIdentityCtmCount} 箇所（0であること）`],
  ['線分の総数', `${geom.segments.length}`],
  ['20m正方形の面積', `${area(verificationSquare()).toFixed(2)} ㎡`],
  ['埋め込みフォント', fonts.map((f) => `${f.baseFont} / 字形データ ${f.fontFileBytes.toLocaleString()} バイト`).join(', ')],
  ['フォント実体', `${fontBytes.length.toLocaleString()} バイト`],
  ['サブセット圧縮率', fonts.length > 0 ? `${((fonts[0].fontFileBytes / fontBytes.length) * 100).toFixed(2)} %` : '—'],
  ['計画平面図PDF', `${plan.length.toLocaleString()} バイト`],
  ['検証シートPDF', `${calib.length.toLocaleString()} バイト`],
];

const w = Math.max(...rows.map((r) => r[0].length));
for (const [k, v] of rows) console.log(`${k.padEnd(w, '　')} : ${v}`);
