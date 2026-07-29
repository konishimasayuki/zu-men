/**
 * 図枠・表題・方位記号・表題欄の描画。
 *
 * 体裁は参考図面（reference/IMG_9055.png）の実物に合わせる。
 * CLAUDE.md「参考図面から読み取った要件」の体裁表を正とする。
 * ここは敷地データから完全に独立させ、2件の案件で使い回す。
 */

import { PDFPage, PDFFont, rgb } from 'pdf-lib';
import { mmToPt } from '../paper/units';
import {
  PaperSize,
  frameOf,
  FRAME_INNER_OFFSET_MM,
  TITLE_BOX_MM,
  TITLE_BLOCK_MM,
  NORTH_MARK_MM,
} from '../paper/layout';

const BLACK = rgb(0, 0, 0);

/** 線幅[mm]。図面用の細線。 */
export const LINE_WIDTH_MM = {
  frameOuter: 0.6,
  frameInner: 0.3,
  box: 0.3,
  symbol: 0.25,
} as const;

/** 表題欄の1行。項目名と値はユーザーが入力する。 */
export interface TitleBlockRow {
  label: string;
  value: string;
}

export interface FrameOptions {
  size: PaperSize;
  font: PDFFont;
  /** 表題。既定は「計画平面図　S＝1/250」 */
  title?: string;
  /** 右下の表題欄の中身。空配列なら罫線だけ引く。 */
  titleBlockRows?: readonly TitleBlockRow[];
}

function rect(page: PDFPage, xMm: number, yMm: number, wMm: number, hMm: number, widthMm: number) {
  page.drawRectangle({
    x: mmToPt(xMm),
    y: mmToPt(yMm),
    width: mmToPt(wMm),
    height: mmToPt(hMm),
    borderColor: BLACK,
    borderWidth: mmToPt(widthMm),
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

  rect(page, boxX, boxY, boxW, boxH, LINE_WIDTH_MM.box);

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
 * 表題欄。右下。中身はユーザーが入力する。
 * 行が無ければ外枠だけを引き、参考図面と同じ空欄の状態にする。
 */
export function drawTitleBlock(
  page: PDFPage,
  size: PaperSize,
  font: PDFFont,
  rows: readonly TitleBlockRow[],
): void {
  const f = frameOf(size);
  const o = FRAME_INNER_OFFSET_MM;
  const w = TITLE_BLOCK_MM.widthMm;
  const h = TITLE_BLOCK_MM.heightMm;
  const x = f.xMm + f.widthMm - o - w;
  const y = f.yMm + o;

  rect(page, x, y, w, h, LINE_WIDTH_MM.box);
  if (rows.length === 0) return;

  const rowH = h / rows.length;
  const labelW = w * 0.36;
  const fontSize = mmToPt(3.0);

  rows.forEach((row, i) => {
    // 上の行から順に描く
    const rowY = y + h - rowH * (i + 1);
    if (i > 0) line(page, x, rowY + rowH, x + w, rowY + rowH, LINE_WIDTH_MM.box);
    line(page, x + labelW, rowY, x + labelW, rowY + rowH, LINE_WIDTH_MM.box);

    const textY = mmToPt(rowY + rowH / 2 - 1.1);
    page.drawText(row.label, { x: mmToPt(x + 2), y: textY, size: fontSize, font, color: BLACK });
    page.drawText(row.value, { x: mmToPt(x + labelW + 2), y: textY, size: fontSize, font, color: BLACK });
  });
}

/** 図枠まわりを一括で描く。 */
export function drawSheet(page: PDFPage, opts: FrameOptions): void {
  drawFrame(page, opts.size);
  drawTitle(page, opts.size, opts.font, opts.title ?? '計画平面図　S＝1/250');
  drawNorthMark(page, opts.size);
  drawTitleBlock(page, opts.size, opts.font, opts.titleBlockRows ?? []);
}
