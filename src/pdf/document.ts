/**
 * PDFドキュメントの生成。
 *
 * CLAUDE.md「絶対に守る制約」1 のとおり、出力はここで作るベクタPDFだけ。
 * ブラウザ印刷（window.print / @page）は縮尺が狂うため使わない。
 */

import { PDFDocument, PDFPage, PDFFont, pushGraphicsState, concatTransformationMatrix } from 'pdf-lib';
import { mmToPt } from '../paper/units';
import { PaperSize } from '../paper/layout';
import { PrinterCalibration, calibrationFactor, calibrationMatrix, isIdentity } from '../paper/calibration';
import { embedJapaneseFont } from './font';

export interface SheetContext {
  doc: PDFDocument;
  page: PDFPage;
  font: PDFFont;
  size: PaperSize;
  /** 実際に適用された印刷補正の倍率。補正なしなら1。 */
  calibrationFactor: number;
}

/**
 * 用紙1枚を作る。MediaBoxは用紙の実寸をptに変換した値そのもの。
 * 用紙の寸法自体には決して倍率を掛けない。
 *
 * 印刷補正を指定した場合だけ、ページ内容の先頭に拡大縮小の座標変換を1つだけ置く。
 * 補正はこの1箇所に集約し、描画コードは補正の存在を知らない。
 */
export async function createSheet(
  size: PaperSize,
  fontBytes: Uint8Array | ArrayBuffer,
  calibration?: PrinterCalibration,
): Promise<SheetContext> {
  const doc = await PDFDocument.create();
  const font = await embedJapaneseFont(doc, fontBytes);
  const widthPt = mmToPt(size.widthMm);
  const heightPt = mmToPt(size.heightMm);
  const page = doc.addPage([widthPt, heightPt]);

  let factor = 1;
  if (calibration && !isIdentity(calibration)) {
    factor = calibrationFactor(calibration);
    page.pushOperators(
      pushGraphicsState(),
      concatTransformationMatrix(...calibrationMatrix(factor, widthPt, heightPt)),
    );
  }

  return { doc, page, font, size, calibrationFactor: factor };
}
