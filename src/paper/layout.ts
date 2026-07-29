/**
 * 用紙と図郭の定義。
 *
 * 参考図面（reference/IMG_9055.png）の体裁に合わせる。
 * 綴じ代は左端、図枠は二重線、表題は上辺中央やや右の横書き枠、
 * 方位記号は左上、表題欄は右下。
 */

import { paperMmToMeters } from './transform';

export type PaperSizeName = 'A4' | 'A3' | 'A2' | 'A1';

export interface PaperSize {
  name: PaperSizeName;
  /** 横[mm]。すべて横向き（landscape）で使う。 */
  widthMm: number;
  /** 縦[mm] */
  heightMm: number;
}

export const PAPER_SIZES: Record<PaperSizeName, PaperSize> = {
  A4: { name: 'A4', widthMm: 297, heightMm: 210 },
  A3: { name: 'A3', widthMm: 420, heightMm: 297 },
  A2: { name: 'A2', widthMm: 594, heightMm: 420 },
  A1: { name: 'A1', widthMm: 841, heightMm: 594 },
};

/** 大きい順に並べた用紙名。収まる最小の用紙を探すときに使う。 */
export const PAPER_ORDER: readonly PaperSizeName[] = ['A4', 'A3', 'A2', 'A1'];

/**
 * 既定の用紙。依頼者のプリンタがA4のため A4横。
 *
 * **A3で作図してA4に縮小印刷してはならない。** 縮尺が壊れる。
 * A4に収まらない場合はより大きい用紙を提案し、その用紙で等倍印刷してもらう。
 */
export const DEFAULT_PAPER: PaperSize = PAPER_SIZES.A4;

/** 余白。左だけ綴じ代のぶん広い。 */
export const MARGIN_MM = {
  left: 20,
  right: 15,
  top: 15,
  bottom: 15,
} as const;

/** 二重図枠の内側の線を外側から何mm入れるか。 */
export const FRAME_INNER_OFFSET_MM = 1.5;

export interface Frame {
  /** 用紙左下を原点とした図郭の左下 */
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
}

/** 用紙サイズから図郭（描画可能領域）を求める。 */
export function frameOf(size: PaperSize): Frame {
  return {
    xMm: MARGIN_MM.left,
    yMm: MARGIN_MM.bottom,
    widthMm: size.widthMm - MARGIN_MM.left - MARGIN_MM.right,
    heightMm: size.heightMm - MARGIN_MM.top - MARGIN_MM.bottom,
  };
}

/** 図郭が実世界で何メートル四方に相当するか。用紙に収まるかの判定に使う。 */
export function frameExtentMeters(size: PaperSize, scaleDenominator: number): { widthM: number; heightM: number } {
  const f = frameOf(size);
  return {
    widthM: paperMmToMeters(f.widthMm, scaleDenominator),
    heightM: paperMmToMeters(f.heightMm, scaleDenominator),
  };
}

/**
 * 敷地の実寸が収まる最小の用紙を選ぶ。収まらなければ null。
 * CLAUDE.md 第2段階「収まらない場合は警告しA2/A1を提案する」に使う。
 */
export function smallestPaperFor(
  widthM: number,
  heightM: number,
  scaleDenominator: number,
): PaperSize | null {
  for (const name of PAPER_ORDER) {
    const size = PAPER_SIZES[name];
    const extent = frameExtentMeters(size, scaleDenominator);
    if (widthM <= extent.widthM && heightM <= extent.heightM) return size;
  }
  return null;
}

/** 表題枠。上辺中央やや右。 */
export const TITLE_BOX_MM = {
  widthMm: 78,
  heightMm: 9,
  /** 図郭の上辺から下へのオフセット */
  topOffsetMm: 6,
  /** 図郭中央から右へのオフセット */
  centerRightShiftMm: 30,
} as const;

/** 表題欄（右下の枠）。中身はユーザーが入力する。 */
export const TITLE_BLOCK_MM = {
  widthMm: 90,
  heightMm: 28,
} as const;

/** 方位記号。左上。 */
export const NORTH_MARK_MM = {
  /** 図郭の左辺から右へ */
  leftOffsetMm: 22,
  /** 図郭の上辺から下へ（記号の中心まで） */
  topOffsetMm: 30,
  /** 八芒星の外接半径 */
  radiusMm: 5,
  /** 中心から矢先までの長さ */
  needleMm: 20,
} as const;
