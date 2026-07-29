/**
 * 紙面mmで描くための薄い層。
 *
 * pdf-lib は pt で受け取るが、図面の組み立てはすべてmmで考える。
 * mm→ptの変換をここ1箇所に閉じ込め、記号や地物の描画コードからptを消す。
 */

import {
  PDFPage, PDFFont, rgb, RGB, degrees,
  pushGraphicsState, popGraphicsState, moveTo, lineTo, closePath, clip, endPath,
} from 'pdf-lib';
import { mmToPt } from '../paper/units';
import { SURVEY_LINE_WIDTHS_MM, SIDE_DITCH_LINE_NUMBER } from '../draw/standards';

export interface Pt2 {
  /** 紙面の横[mm]。右が正。 */
  mmX: number;
  /** 紙面の縦[mm]。上が正。 */
  mmY: number;
}

export const BLACK: RGB = rgb(0, 0, 0);

/**
 * 線幅[mm]。**すべて公共測量標準図式 第7条の線号に一致させる。**
 *
 * 1号0.05 / 2号0.10 / 3号0.15 / 4号0.20 / 5号0.25 / 6号0.30 / 7号0.35 /
 * 8号0.40 / 10号0.50。許容誤差は各線号を通じて±0.025mm。
 * 中間の値（0.22や0.6など）は規格に無いので使わない。
 *
 * 図枠だけは JIS Z 8311「輪郭線は最小0.5mm」に従い10号(0.50mm)以上とする。
 */
export const LW = {
  /** 図枠の外線。JIS Z 8311 の輪郭線。10号 */
  frameOuter: SURVEY_LINE_WIDTHS_MM[10],
  /** 図枠の内線。6号 */
  frameInner: SURVEY_LINE_WIDTHS_MM[6],
  /** 中心マーク。JIS Z 8311 は最小0.5mm。10号 */
  centerMark: SURVEY_LINE_WIDTHS_MM[10],
  /** 申請地の筆界。図面の主対象なので太い。8号 */
  siteBoundary: SURVEY_LINE_WIDTHS_MM[8],
  /** 隣接筆の筆界。5号 */
  parcelBoundary: SURVEY_LINE_WIDTHS_MM[5],
  /** 道路・水路の輪郭。5号 */
  corridor: SURVEY_LINE_WIDTHS_MM[5],
  /** 側溝。図式で3号と定められている */
  sideDitch: SURVEY_LINE_WIDTHS_MM[SIDE_DITCH_LINE_NUMBER],
  /** 車・記号。4号 */
  symbol: SURVEY_LINE_WIDTHS_MM[4],
  /** 区画の割り線。4号 */
  stall: SURVEY_LINE_WIDTHS_MM[4],
  /** 細線（法面のケバ、構囲など）。3号 */
  hair: SURVEY_LINE_WIDTHS_MM[3],
} as const;

export function add(a: Pt2, dx: number, dy: number): Pt2 {
  return { mmX: a.mmX + dx, mmY: a.mmY + dy };
}

export function lerp(a: Pt2, b: Pt2, t: number): Pt2 {
  return { mmX: a.mmX + (b.mmX - a.mmX) * t, mmY: a.mmY + (b.mmY - a.mmY) * t };
}

export function distance(a: Pt2, b: Pt2): number {
  return Math.hypot(b.mmX - a.mmX, b.mmY - a.mmY);
}

/** a→b の単位方向ベクトル。長さ0なら (1,0)。 */
export function direction(a: Pt2, b: Pt2): { dx: number; dy: number } {
  const len = distance(a, b);
  if (len === 0) return { dx: 1, dy: 0 };
  return { dx: (b.mmX - a.mmX) / len, dy: (b.mmY - a.mmY) / len };
}

/** 左90度に回した単位ベクトル。 */
export function normal(d: { dx: number; dy: number }): { dx: number; dy: number } {
  return { dx: -d.dy, dy: d.dx };
}

export class Pen {
  constructor(
    private readonly page: PDFPage,
    private readonly font: PDFFont,
  ) {}

  line(a: Pt2, b: Pt2, widthMm: number): void {
    this.page.drawLine({
      start: { x: mmToPt(a.mmX), y: mmToPt(a.mmY) },
      end: { x: mmToPt(b.mmX), y: mmToPt(b.mmY) },
      color: BLACK,
      thickness: mmToPt(widthMm),
    });
  }

  polyline(points: readonly Pt2[], widthMm: number, close = false): void {
    for (let i = 0; i < points.length - 1; i++) this.line(points[i], points[i + 1], widthMm);
    if (close && points.length > 2) this.line(points[points.length - 1], points[0], widthMm);
  }

  rect(origin: Pt2, widthMm: number, heightMm: number, lineWidthMm: number): void {
    this.page.drawRectangle({
      x: mmToPt(origin.mmX),
      y: mmToPt(origin.mmY),
      width: mmToPt(widthMm),
      height: mmToPt(heightMm),
      borderColor: BLACK,
      borderWidth: mmToPt(lineWidthMm),
    });
  }

  circle(center: Pt2, radiusMm: number, lineWidthMm: number): void {
    this.page.drawCircle({
      x: mmToPt(center.mmX),
      y: mmToPt(center.mmY),
      size: mmToPt(radiusMm),
      borderColor: BLACK,
      borderWidth: mmToPt(lineWidthMm),
    });
  }

  /**
   * 文字。既定は指定点を左下として置く。
   * align を渡すと横方向の基準を変えられる。
   */
  text(
    value: string,
    at: Pt2,
    sizeMm: number,
    opts: { align?: 'left' | 'center' | 'right'; rotateDeg?: number } = {},
  ): void {
    const size = mmToPt(sizeMm);
    const width = this.font.widthOfTextAtSize(value, size);
    let x = mmToPt(at.mmX);
    if (opts.align === 'center') x -= width / 2;
    else if (opts.align === 'right') x -= width;

    this.page.drawText(value, {
      x,
      y: mmToPt(at.mmY),
      size,
      font: this.font,
      color: BLACK,
      ...(opts.rotateDeg ? { rotate: degrees(opts.rotateDeg) } : {}),
    });
  }

  /** 文字列の幅[mm]。ラベルの当たり判定や中央寄せに使う。 */
  textWidthMm(value: string, sizeMm: number): number {
    return this.font.widthOfTextAtSize(value, mmToPt(sizeMm)) / mmToPt(1);
  }

  /**
   * 矩形でクリップした状態で描く。
   *
   * 周辺の筆や道路は図郭の外まで続いているので、これが無いと線が
   * 図枠を突き抜けて紙いっぱいに走る。参考図面は図郭の内側で切れている。
   */
  clipped(origin: Pt2, widthMm: number, heightMm: number, body: () => void): void {
    const x0 = mmToPt(origin.mmX);
    const y0 = mmToPt(origin.mmY);
    const x1 = mmToPt(origin.mmX + widthMm);
    const y1 = mmToPt(origin.mmY + heightMm);
    this.page.pushOperators(
      pushGraphicsState(),
      moveTo(x0, y0), lineTo(x1, y0), lineTo(x1, y1), lineTo(x0, y1), closePath(),
      clip(), endPath(),
    );
    try {
      body();
    } finally {
      this.page.pushOperators(popGraphicsState());
    }
  }
}
