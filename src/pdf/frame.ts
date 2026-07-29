/**
 * 図枠・表題・方位記号・表題欄の描画。
 *
 * 体裁は参考図面（reference/IMG_9055.png）の実物に合わせる。
 * CLAUDE.md「参考図面から読み取った要件」の体裁表を正とする。
 * ここは敷地データから完全に独立させ、2件の案件で使い回す。
 */

import { PDFPage, PDFFont, rgb } from 'pdf-lib';
import { mmToPt } from '../paper/units';
import { PaperSize, frameOf, FRAME_INNER_OFFSET_MM, TITLE_BOX_MM, NORTH_MARK_MM } from '../paper/layout';
import { SURVEY_LINE_WIDTHS_MM, JIS_Z8311 } from '../draw/standards';

const BLACK = rgb(0, 0, 0);

/**
 * 線幅[mm]。公共測量標準図式 第7条の線号に一致させる。
 * 図枠は JIS Z 8311「輪郭線は最小0.5mm」に従い10号(0.50mm)。
 */
export const LINE_WIDTH_MM = {
  frameOuter: SURVEY_LINE_WIDTHS_MM[10],
  frameInner: SURVEY_LINE_WIDTHS_MM[6],
  centerMark: SURVEY_LINE_WIDTHS_MM[10],
  box: SURVEY_LINE_WIDTHS_MM[6],
  symbol: SURVEY_LINE_WIDTHS_MM[5],
} as const;

export interface FrameOptions {
  size: PaperSize;
  font: PDFFont;
  /** 表題。既定は「計画平面図　S＝1/250」 */
  title?: string;
}

function rect(
  page: PDFPage,
  xMm: number,
  yMm: number,
  wMm: number,
  hMm: number,
  widthMm: number,
  fillWhite = false,
) {
  page.drawRectangle({
    x: mmToPt(xMm),
    y: mmToPt(yMm),
    width: mmToPt(wMm),
    height: mmToPt(hMm),
    borderColor: BLACK,
    borderWidth: mmToPt(widthMm),
    ...(fillWhite ? { color: rgb(1, 1, 1) } : {}),
  });
}

function line(page: PDFPage, x1Mm: number, y1Mm: number, x2Mm: number, y2Mm: number, widthMm: number) {
  page.drawLine({
    start: { x: mmToPt(x1Mm), y: mmToPt(y1Mm) },
    end: { x: mmToPt(x2Mm), y: mmToPt(y2Mm) },
    color: BLACK,
    thickness: mmToPt(widthMm),
  });
}

/** 二重の図枠。外側と、そこから内側に1.5mm入った線。 */
export function drawFrame(page: PDFPage, size: PaperSize): void {
  const f = frameOf(size);
  rect(page, f.xMm, f.yMm, f.widthMm, f.heightMm, LINE_WIDTH_MM.frameOuter);
  const o = FRAME_INNER_OFFSET_MM;
  rect(page, f.xMm + o, f.yMm + o, f.widthMm - 2 * o, f.heightMm - 2 * o, LINE_WIDTH_MM.frameInner);
}

/**
 * 表題。上辺中央やや右に横書きの枠囲み。
 * 参考図面は字間を大きく空けているので、1文字ずつ均等に配置する。
 */
export function drawTitle(page: PDFPage, size: PaperSize, font: PDFFont, title: string): void {
  const f = frameOf(size);
  const boxW = TITLE_BOX_MM.widthMm;
  const boxH = TITLE_BOX_MM.heightMm;
  const boxX = f.xMm + f.widthMm / 2 - boxW / 2 + TITLE_BOX_MM.centerRightShiftMm;
  const boxY = f.yMm + f.heightMm - TITLE_BOX_MM.topOffsetMm - boxH;

  // 背後の筆界線が透けないよう白で塗る
  rect(page, boxX, boxY, boxW, boxH, LINE_WIDTH_MM.box, true);

  const fontSizeMm = 4.2;
  const fontSize = mmToPt(fontSizeMm);
  const chars = [...title];
  // 枠内に均等割り付けする。左右に0.5文字ぶんの余白を取る。
  const step = boxW / (chars.length + 1);
  const baselineY = boxY + (boxH - fontSizeMm * 0.72) / 2;
  chars.forEach((ch, i) => {
    if (ch === ' ' || ch === '　') return;
    const w = font.widthOfTextAtSize(ch, fontSize);
    page.drawText(ch, {
      x: mmToPt(boxX + step * (i + 1)) - w / 2,
      y: mmToPt(baselineY),
      size: fontSize,
      font,
      color: BLACK,
    });
  });
}

/**
 * 方位記号。左上。八芒星と、そこから上に伸びる矢羽根つきの針。
 * 参考図面では北はほぼ真上を向いている。北固定なので回転させない。
 */
export function drawNorthMark(page: PDFPage, size: PaperSize): void {
  const f = frameOf(size);
  const cx = f.xMm + NORTH_MARK_MM.leftOffsetMm;
  const cy = f.yMm + f.heightMm - NORTH_MARK_MM.topOffsetMm;
  const r = NORTH_MARK_MM.radiusMm;
  const inner = r * 0.22;

  // 八芒星。長い4本（東西南北）と短い4本（斜め）を交互に。
  for (let i = 0; i < 8; i++) {
    const a = (Math.PI / 4) * i;
    const len = i % 2 === 0 ? r : r * 0.55;
    const tipX = cx + len * Math.sin(a);
    const tipY = cy + len * Math.cos(a);
    const leftA = a - Math.PI / 8;
    const rightA = a + Math.PI / 8;
    const p1x = cx + inner * Math.sin(leftA);
    const p1y = cy + inner * Math.cos(leftA);
    const p2x = cx + inner * Math.sin(rightA);
    const p2y = cy + inner * Math.cos(rightA);
    line(page, p1x, p1y, tipX, tipY, LINE_WIDTH_MM.symbol);
    line(page, tipX, tipY, p2x, p2y, LINE_WIDTH_MM.symbol);
  }

  // 北を指す針。星の中心を貫いて上へ伸びる。
  const tail = cy - r * 0.9;
  const head = cy + NORTH_MARK_MM.needleMm;
  line(page, cx, tail, cx, head, LINE_WIDTH_MM.symbol);

  // 矢羽根。針の先の少し下に付く旗のような三角。
  const flagBase = head - 4.2;
  line(page, cx, head, cx + 2.0, flagBase + 1.4, LINE_WIDTH_MM.symbol);
  line(page, cx + 2.0, flagBase + 1.4, cx, flagBase, LINE_WIDTH_MM.symbol);
}

/**
 * 中心マーク。JIS Z 8311 が定める図面の要素。
 * 用紙の四辺の中央から、輪郭線の内側へ約5mm入ったところまで引く。
 * 図面の複写や折りたたみの基準になる。
 */
export function drawCenterMarks(page: PDFPage, size: PaperSize): void {
  const f = frameOf(size);
  const reach = JIS_Z8311.centerMark.reachMm;
  const w = LINE_WIDTH_MM.centerMark;
  const cx = size.widthMm / 2;
  const cy = size.heightMm / 2;

  // 下辺・上辺
  line(page, cx, 0, cx, f.yMm + reach, w);
  line(page, cx, size.heightMm, cx, f.yMm + f.heightMm - reach, w);
  // 左辺・右辺
  line(page, 0, cy, f.xMm + reach, cy, w);
  line(page, size.widthMm, cy, f.xMm + f.widthMm - reach, cy, w);
}

/**
 * 図枠まわりを一括で描く。
 *
 * 右下の表題欄は描かない。参考図面には空欄の枠があるが、依頼者の指示により省く。
 */
export function drawSheet(page: PDFPage, opts: FrameOptions): void {
  drawFrame(page, opts.size);
  drawCenterMarks(page, opts.size);
  drawTitle(page, opts.size, opts.font, opts.title ?? '計画平面図　S＝1/250');
  drawNorthMark(page, opts.size);
}
