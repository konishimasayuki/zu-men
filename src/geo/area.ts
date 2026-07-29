/**
 * 座標法による面積計算と閉合誤差。
 *
 * CLAUDE.md「絶対に守る制約」3 のとおり、緯度経度のまま計算してはならない。
 * この関数に渡してよいのは平面直角座標[m]だけ。
 */

import type { PlaneXY } from '../paper/transform';

/**
 * 倍面積（座標法）。
 * Σ x_i * (y_{i+1} - y_{i-1})
 * 符号は頂点の並び順に依存する。面積を得るには絶対値を取る。
 */
export function doubleArea(points: readonly PlaneXY[]): number {
  const n = points.length;
  if (n < 3) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const prev = points[(i - 1 + n) % n];
    const next = points[(i + 1) % n];
    sum += points[i].x * (next.y - prev.y);
  }
  return sum;
}

/** 面積[㎡]。 */
export function area(points: readonly PlaneXY[]): number {
  return Math.abs(doubleArea(points)) / 2;
}

/** 外周長[m]。 */
export function perimeter(points: readonly PlaneXY[]): number {
  const n = points.length;
  if (n < 2) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    sum += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return sum;
}

export interface Traverse {
  /** 各辺の方位角[度]。真北から時計回り。 */
  bearingsDeg: readonly number[];
  /** 各辺の距離[m]。bearingsDeg と同じ長さ。 */
  distances: readonly number[];
}

export interface ClosureError {
  /** 北方向の閉合差[m] */
  dx: number;
  /** 東方向の閉合差[m] */
  dy: number;
  /** 閉合差の大きさ[m] */
  distance: number;
  /** 全辺長の合計[m] */
  totalLength: number;
  /**
   * 精度。閉合差1に対する周長の比（1/N の N）。
   * 閉合差が0のときは Infinity。
   */
  precisionDenominator: number;
}

/**
 * 閉合したとみなす下限[m]。
 *
 * 三角関数の丸め誤差は 1e-15m 程度残る。これをそのまま比に直すと
 * 「1/15653325707569116」のような無意味な精度が表示されてしまう。
 * 測量で意味を持つ最小桁（mm）よりはるかに細かい 1e-9m を境にして、
 * それ未満は閉合差ゼロとして扱う。
 */
export const CLOSURE_EPSILON_M = 1e-9;

/**
 * 辺長と方位角から閉合誤差を求める。
 * 地積測量図の値を手入力したときに、多角形が閉じるかを確認するために使う。
 */
export function closureError(traverse: Traverse): ClosureError {
  if (traverse.bearingsDeg.length !== traverse.distances.length) {
    throw new Error('方位角と距離の数が一致しません');
  }
  let dx = 0;
  let dy = 0;
  let totalLength = 0;
  for (let i = 0; i < traverse.distances.length; i++) {
    const rad = (traverse.bearingsDeg[i] * Math.PI) / 180;
    dx += traverse.distances[i] * Math.cos(rad);
    dy += traverse.distances[i] * Math.sin(rad);
    totalLength += traverse.distances[i];
  }
  const raw = Math.hypot(dx, dy);
  const closed = raw < CLOSURE_EPSILON_M;
  const distance = closed ? 0 : raw;
  return {
    dx: closed ? 0 : dx,
    dy: closed ? 0 : dy,
    distance,
    totalLength,
    precisionDenominator: closed ? Infinity : totalLength / distance,
  };
}

/**
 * 閉合誤差が許容範囲かを判定する。
 * 既定の許容値は 1/5000（市街地の地籍測量で一般的な精度区分に合わせた暫定値）。
 * 実運用の許容値は案件ごとに設定できるようにする。
 */
export function isClosureAcceptable(err: ClosureError, allowedDenominator = 5000): boolean {
  return err.precisionDenominator >= allowedDenominator;
}
