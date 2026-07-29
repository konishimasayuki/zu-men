/**
 * PDFドキュメントの生成。
 *
 * CLAUDE.md「絶対に守る制約」1 のとおり、出力はここで作るベクタPDFだけ。
 * ブラウザ印刷（window.print / @page）は縮尺が狂うため使わない。
 */

import { PDFDocument, PDFPage, PDFFont } from 'pdf-lib';
import { mmToPt } from '../paper/units';
import { PaperSize } from '../paper/layout';
import { embedJapaneseFont } from './font';

export interface SheetContext {
  doc: PDFDocument;
  page: PDFPage;
  font: PDFFont;
  size: PaperSize;
}

/**
 * 用紙1枚を作る。MediaBoxは用紙の実寸をptに変換した値そのもの。
 * ここに拡大縮小を掛けてはならない。掛けた瞬間に縮尺が壊れる。
 */
export async function createSheet(size: PaperSize, fontBytes: Uint8Array | ArrayBuffer): Promise<SheetContext> {
  const doc = await PDFDocument.create();
  const font = await embedJapaneseFont(doc, fontBytes);
  const page = doc.addPage([mmToPt(size.widthMm), mmToPt(size.heightMm)]);
  return { doc, page, font, size };
}
