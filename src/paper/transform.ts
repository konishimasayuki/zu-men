/**
 * 縮尺変換。**この変換の定義はこのファイルにしか存在しない。**
 *
 * CLAUDE.md「絶対に守る制約」2 のとおり、画面の表示倍率と出力縮尺を連動させない。
 * このモジュールを import してよいのは PDF 生成層（src/pdf/）だけ。
 * 画面側（src/ui/）は平面直角座標のまま扱い、ここを経由しない。
 *
 * 座標系の向きに注意。
 * JGD2011 平面直角座標系は X=北向き、Y=東向き。
 * 紙面は右が東、上が北なので、紙面の横軸にはYが、縦軸にはXが入る。
 */

import { mmToPt } from './units';

/** 図面の縮尺。分母だけを持つ（1/250 なら 250）。 */
export const DEFAULT_SCALE_DENOMINATOR = 250;

/** 平面直角座標の1点。X=北[m]、Y=東[m]。 */
export interface PlaneXY {
  /** 北向き[m] */
  x: number;
  /** 東向き[m] */
  y: number;
}

/** 紙面上の1点。原点は図郭の左下、右がプラス、上がプラス。単位はmm。 */
export interface PaperMm {
  mmX: number;
  mmY: number;
}

/**
 * 実長[m]を紙上の長さ[mm]に変換する。
 * 1/250 では 1m = 4mm、20m = 80mm。
 */
export function metersToPaperMm(meters: number, scaleDenominator = DEFAULT_SCALE_DENOMINATOR): number {
  return (meters * 1000) / scaleDenominator;
}

/** 紙上の長さ[mm]を実長[m]に戻す。 */
export function paperMmToMeters(mm: number, scaleDenominator = DEFAULT_SCALE_DENOMINATOR): number {
  return (mm * scaleDenominator) / 1000;
}

/** 実長[m]を直接ptに変換する。PDF描画のための合成関数。 */
export function metersToPt(meters: number, scaleDenominator = DEFAULT_SCALE_DENOMINATOR): number {
  return mmToPt(metersToPaperMm(meters, scaleDenominator));
}

/**
 * 平面直角座標 → 紙面座標の射影を作る。
 *
 * @param origin 図郭の左下隅に対応する平面直角座標
 */
export function createProjector(origin: PlaneXY, scaleDenominator = DEFAULT_SCALE_DENOMINATOR) {
  return function project(p: PlaneXY): PaperMm {
    return {
      // 東方向（Y）が紙面の横軸
      mmX: metersToPaperMm(p.y - origin.y, scaleDenominator),
      // 北方向（X）が紙面の縦軸
      mmY: metersToPaperMm(p.x - origin.x, scaleDenominator),
    };
  };
}

/** 紙面座標 → 平面直角座標。用紙のドラッグ配置を座標に戻すときに使う。 */
export function createInverseProjector(origin: PlaneXY, scaleDenominator = DEFAULT_SCALE_DENOMINATOR) {
  return function unproject(p: PaperMm): PlaneXY {
    return {
      x: origin.x + paperMmToMeters(p.mmY, scaleDenominator),
      y: origin.y + paperMmToMeters(p.mmX, scaleDenominator),
    };
  };
}
