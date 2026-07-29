/**
 * 図面の記号。すべて参考図面（reference/IMG_9055.png）の実物に合わせる。
 *
 * 寸法はすべて実長[m]で受け取り、縮尺変換を経て紙上mmで描く。
 * 記号の「紙の上での見え方」を一定に保ちたいものだけ mm で持つ
 * （ケバの長さ、玉鎖の玉の大きさなど。縮尺を変えても潰れないようにするため）。
 */

import { Pen, Pt2, LW, direction, normal, distance, lerp } from './pen';

/** 実長[m]→紙上[mm] の変換。呼び出し側から渡す。 */
export type ToMm = (meters: number) => number;

/* ------------------------------------------------------------------ 車 */

/**
 * 車の平面シンボル。
 *
 * 参考図面の車は、角の丸い車体の輪郭と、その内側にひとまわり小さい輪郭、
 * さらに前後を横切る数本の線（ボンネット・フロントガラス・ルーフ・
 * リアガラス・トランク）で構成されている。矩形では代用しない。
 */
export const CAR_LENGTH_M = 4.6;
export const CAR_WIDTH_M = 1.78;

/** 角の丸い長方形の頂点列を作る。丸みは折れ線で近似する。 */
function roundedRect(
  center: Pt2,
  lengthMm: number,
  widthMm: number,
  axis: { dx: number; dy: number },
  radiusMm: number,
  cornerSteps = 4,
): Pt2[] {
  const n = normal(axis);
  const hl = lengthMm / 2;
  const hw = widthMm / 2;
  const r = Math.min(radiusMm, hw * 0.98, hl * 0.98);

  // 車体座標(u=長手, v=幅) から紙面座標へ
  const at = (u: number, v: number): Pt2 => ({
    mmX: center.mmX + axis.dx * u + n.dx * v,
    mmY: center.mmY + axis.dy * u + n.dy * v,
  });

  const pts: Pt2[] = [];
  const corners: Array<[number, number, number]> = [
    [hl - r, hw - r, 0],
    [-(hl - r), hw - r, 90],
    [-(hl - r), -(hw - r), 180],
    [hl - r, -(hw - r), 270],
  ];
  for (const [cu, cv, startDeg] of corners) {
    for (let i = 0; i <= cornerSteps; i++) {
      const a = ((startDeg + (90 * i) / cornerSteps) * Math.PI) / 180;
      pts.push(at(cu + r * Math.cos(a), cv + r * Math.sin(a)));
    }
  }
  return pts;
}

/**
 * 車1台。center は車の中心、axis は車の前方向。
 */
export function drawCar(pen: Pen, center: Pt2, axis: { dx: number; dy: number }, toMm: ToMm): void {
  const L = toMm(CAR_LENGTH_M);
  const W = toMm(CAR_WIDTH_M);
  const n = normal(axis);
  const at = (u: number, v: number): Pt2 => ({
    mmX: center.mmX + axis.dx * u + n.dx * v,
    mmY: center.mmY + axis.dy * u + n.dy * v,
  });

  // 車体の輪郭
  pen.polyline(roundedRect(center, L, W, axis, W * 0.32), LW.symbol, true);
  // 内側の輪郭。参考図面では車体の内側にもう一周ある。
  pen.polyline(roundedRect(center, L * 0.9, W * 0.66, axis, W * 0.22), LW.symbol, true);

  // 前から順に、ボンネット・フロントガラス・ルーフ・リアガラスの区切り。
  // 位置は車体長に対する比。参考図面の割りに合わせている。
  const innerHalfW = (W * 0.66) / 2;
  for (const t of [0.18, 0.04, -0.16, -0.34]) {
    pen.line(at(L * t, -innerHalfW), at(L * t, innerHalfW), LW.symbol);
  }
}

/* ------------------------------------------------------- フェンス（玉鎖線） */

/** 玉鎖の玉の間隔[mm]。紙の上での見え方を一定にするためmmで持つ。 */
const CHAIN_PITCH_MM = 1.1;
const CHAIN_BEAD_MM = 0.32;

/**
 * フェンス。参考図面では、線に沿って小さな玉が連なる「玉鎖線」で描かれている。
 * 敷地の外周に入る。
 */
export function drawFence(pen: Pen, points: readonly Pt2[]): void {
  pen.polyline(points, LW.hair);
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const len = distance(a, b);
    const count = Math.max(1, Math.round(len / CHAIN_PITCH_MM));
    for (let k = 0; k <= count; k++) {
      pen.circle(lerp(a, b, k / count), CHAIN_BEAD_MM, LW.hair);
    }
  }
}

/* ------------------------------------------------------ 土留め（外向きT字） */

const RETAIN_PITCH_MM = 4.5;
const RETAIN_STEM_MM = 1.5;
const RETAIN_BAR_MM = 1.7;

/**
 * 土留め。参考図面では、境界線から外向きにT字の記号が一定間隔で並ぶ。
 * `outwardLeft` は、進行方向の左が外側かどうか。
 */
export function drawRetainingWall(pen: Pen, points: readonly Pt2[], outwardLeft = true): void {
  pen.polyline(points, LW.hair);
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const d = direction(a, b);
    const nrm = normal(d);
    const sign = outwardLeft ? 1 : -1;
    const len = distance(a, b);
    const count = Math.floor(len / RETAIN_PITCH_MM);
    for (let k = 1; k <= count; k++) {
      const base = lerp(a, b, (k * RETAIN_PITCH_MM) / len);
      const tip: Pt2 = {
        mmX: base.mmX + nrm.dx * RETAIN_STEM_MM * sign,
        mmY: base.mmY + nrm.dy * RETAIN_STEM_MM * sign,
      };
      pen.line(base, tip, LW.hair);
      // T字の横棒
      const half = RETAIN_BAR_MM / 2;
      pen.line(
        { mmX: tip.mmX - d.dx * half, mmY: tip.mmY - d.dy * half },
        { mmX: tip.mmX + d.dx * half, mmY: tip.mmY + d.dy * half },
        LW.hair,
      );
    }
  }
}

/* --------------------------------------------------------------- ケバ */

const KEBA_PITCH_MM = 1.4;
const KEBA_LENGTH_MM = 1.0;

/** 多角形の符号付き面積。正なら反時計回り。 */
function signedArea(points: readonly Pt2[]): number {
  let a = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const q = points[(i + 1) % points.length];
    a += p.mmX * q.mmY - q.mmX * p.mmY;
  }
  return a / 2;
}

/**
 * ケバ（毛羽）。輪郭線の片側に短い線を並べる。
 * 参考図面では隣家の建物輪郭と、道路の法面に使われている。
 * `inward` が true なら閉じた図形の内側へ生やす。
 */
export function drawKeba(
  pen: Pen,
  points: readonly Pt2[],
  closed: boolean,
  inward = true,
  lengthMm = KEBA_LENGTH_MM,
  pitchMm = KEBA_PITCH_MM,
): void {
  pen.polyline(points, LW.hair, closed);
  const segs = closed ? points.length : points.length - 1;
  // 閉じた図形は回り方で左法線の向きが変わる。頂点の順序に依存させない。
  const ccw = closed ? signedArea(points) > 0 : true;
  for (let i = 0; i < segs; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const d = direction(a, b);
    const nrm = normal(d);
    const sign = (inward ? 1 : -1) * (ccw ? 1 : -1);
    const len = distance(a, b);
    const count = Math.floor(len / pitchMm);
    for (let k = 1; k <= count; k++) {
      const base = lerp(a, b, (k * pitchMm) / len);
      pen.line(
        base,
        { mmX: base.mmX + nrm.dx * lengthMm * sign, mmY: base.mmY + nrm.dy * lengthMm * sign },
        LW.hair,
      );
    }
  }
}

/* ------------------------------------------------------------- 集水桝 */

/** 集水桝。参考図面では境界の外側に小さな菱形で描かれている。 */
export function drawBasin(pen: Pen, center: Pt2, sizeMm = 2.2): void {
  const h = sizeMm / 2;
  pen.polyline(
    [
      { mmX: center.mmX, mmY: center.mmY + h },
      { mmX: center.mmX + h, mmY: center.mmY },
      { mmX: center.mmX, mmY: center.mmY - h },
      { mmX: center.mmX - h, mmY: center.mmY },
    ],
    LW.symbol,
    true,
  );
}

/* ------------------------------------------------------------- 引出し線 */

/** ラベルの引出し線。折れ点を1つ持つ。 */
export function drawLeader(pen: Pen, from: Pt2, elbow: Pt2, to: Pt2): void {
  pen.polyline([from, elbow, to], LW.hair);
}
