/**
 * 駐車区画の割付。
 *
 * 寸法は駐車場法施行令第7条および駐車場設計・施工指針による。
 * - 普通乗用車の駐車マス: 幅2.5m × 奥行5.0m
 * - 車路の幅員: 対面通行 5.5m以上、一方通行 3.5m以上
 *
 * 参考図面は車路の両側に直角駐車の帯を並べた形をしている。
 */

import type { PlaneXY } from '../paper/transform';
import type { StallBand, Stall } from './scene';
import { PARKING_STANDARDS, isAisleWidthValid } from './standards';

export const DEFAULT_STALL = {
  widthM: PARKING_STANDARDS.stall.widthM,
  depthM: PARKING_STANDARDS.stall.depthM,
  /** 既定は対面通行の下限。一方通行なら3.5mまで詰められる。 */
  aisleM: PARKING_STANDARDS.aisle.twoWayMinM,
} as const;

export interface AisleCheck {
  widthM: number;
  oneWay: boolean;
  requiredM: number;
  ok: boolean;
}

/**
 * 車路幅が駐車場法施行令の基準を満たすか調べる。
 * 満たさない値をそのまま図面に出すと、審査で差し戻される。
 */
export function checkAisleWidth(widthM: number, oneWay: boolean): AisleCheck {
  return {
    widthM,
    oneWay,
    requiredM: oneWay ? PARKING_STANDARDS.aisle.oneWayMinM : PARKING_STANDARDS.aisle.twoWayMinM,
    ok: isAisleWidthValid(widthM, oneWay),
  };
}

export interface BandSpec {
  /** 帯の起点（帯の一方の角。車路側の縁の端）。 */
  origin: PlaneXY;
  /** 帯が伸びる方位角[度]（真北から時計回り）。マスはこの向きに並ぶ。 */
  runBearingDeg: number;
  /** マスの数。 */
  count: number;
  /**
   * 車の頭が向く側。true なら進行方向の左（runBearing から反時計回り90度）へ
   * 帯が伸びる。車路が右にある場合に使う。
   */
  depthLeft: boolean;
  widthM?: number;
  depthM?: number;
}

function unit(bearingDeg: number): { ex: number; ey: number } {
  const r = (bearingDeg * Math.PI) / 180;
  // X=北, Y=東 なので、方位角0度は +X 方向
  return { ex: Math.cos(r), ey: Math.sin(r) };
}

/**
 * 1本の帯を作る。帯の外形と、各マスの中心・車の向きを返す。
 */
export function makeBand(spec: BandSpec): StallBand {
  const w = spec.widthM ?? DEFAULT_STALL.widthM;
  const d = spec.depthM ?? DEFAULT_STALL.depthM;

  const run = unit(spec.runBearingDeg);
  // 帯の奥行き方向。runBearing から左90度（=方位角 -90度）か右90度。
  const depthBearing = spec.runBearingDeg + (spec.depthLeft ? -90 : 90);
  const dep = unit(depthBearing);

  const totalRun = w * spec.count;
  const at = (alongRun: number, alongDepth: number): PlaneXY => ({
    x: spec.origin.x + run.ex * alongRun + dep.ex * alongDepth,
    y: spec.origin.y + run.ey * alongRun + dep.ey * alongDepth,
  });

  const outline: PlaneXY[] = [at(0, 0), at(totalRun, 0), at(totalRun, d), at(0, d)];

  const stalls: Stall[] = [];
  for (let i = 0; i < spec.count; i++) {
    stalls.push({
      center: at(w * (i + 0.5), d / 2),
      // 車は車路側（帯の入口側）に頭を向ける。帯は車路から奥へ伸びるので、
      // 車の前方向は奥行き方向の逆。
      bearingDeg: depthBearing + 180,
    });
  }

  return { outline, stalls };
}

/** 帯に含まれる台数の合計。図面には出さず画面表示に使う。 */
export function countStalls(bands: readonly StallBand[]): number {
  return bands.reduce((sum, b) => sum + b.stalls.filter((s) => s.withCar !== false).length, 0);
}
