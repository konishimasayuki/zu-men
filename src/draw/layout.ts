/**
 * 任意の形の敷地に駐車区画を割り付ける。
 *
 * 実データの筆は矩形ではない。敷地の向きを求め、その向きに沿って
 * 「区画の帯 → 車路 → 区画の帯」を並べ、敷地からはみ出すマスを落とす。
 *
 * 寸法は駐車場法施行令第7条／駐車場設計・施工指針による（draw/standards.ts）。
 */

import type { PlaneXY } from '../paper/transform';
import type { StallBand, Stall } from './scene';
import { PARKING_STANDARDS } from './standards';
import { area as polygonArea } from '../geo/area';

/* ------------------------------------------------------ 敷地の向きを求める */

export interface OrientedBox {
  /** 長手方向の方位角[度]（真北から時計回り）。 */
  bearingDeg: number;
  /** 長手の長さ[m]。 */
  lengthM: number;
  /** 短手の長さ[m]。 */
  widthM: number;
  /** 外接矩形の中心。 */
  center: PlaneXY;
}

/**
 * 最小面積の外接矩形。
 *
 * 凸包の各辺に沿って回してみて、面積が最小になる向きを採る（回転キャリパー法）。
 * 「敷地がどちらを向いているか」はこれで決める。目測に頼らない。
 */
export function minimumAreaRectangle(outline: readonly PlaneXY[]): OrientedBox {
  const hull = convexHull(outline);
  if (hull.length < 3) {
    return { bearingDeg: 0, lengthM: 0, widthM: 0, center: outline[0] ?? { x: 0, y: 0 } };
  }

  let best: OrientedBox | null = null;
  let bestArea = Infinity;

  for (let i = 0; i < hull.length; i++) {
    const a = hull[i];
    const b = hull[(i + 1) % hull.length];
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const len = Math.hypot(ex, ey);
    if (len < 1e-9) continue;
    // この辺を u 軸とする局所座標
    const ux = ex / len;
    const uy = ey / len;
    // v 軸は u を左90度回したもの
    const vx = -uy;
    const vy = ux;

    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (const p of hull) {
      const u = (p.x - a.x) * ux + (p.y - a.y) * uy;
      const v = (p.x - a.x) * vx + (p.y - a.y) * vy;
      minU = Math.min(minU, u); maxU = Math.max(maxU, u);
      minV = Math.min(minV, v); maxV = Math.max(maxV, v);
    }
    const du = maxU - minU;
    const dv = maxV - minV;
    const area = du * dv;
    if (area >= bestArea) continue;

    bestArea = area;
    const cu = (minU + maxU) / 2;
    const cv = (minV + maxV) / 2;
    const center = { x: a.x + ux * cu + vx * cv, y: a.y + uy * cu + vy * cv };
    // 長い方を長手とする
    const longIsU = du >= dv;
    const axis = longIsU ? { x: ux, y: uy } : { x: vx, y: vy };
    best = {
      // 方位角は北(X)からの時計回り。axis=(x=北成分, y=東成分)
      bearingDeg: normaliseBearing((Math.atan2(axis.y, axis.x) * 180) / Math.PI),
      lengthM: Math.max(du, dv),
      widthM: Math.min(du, dv),
      center,
    };
  }

  return best ?? { bearingDeg: 0, lengthM: 0, widthM: 0, center: outline[0] };
}

/** 0〜180度に畳む。向きは180度違っても同じ。 */
function normaliseBearing(deg: number): number {
  let d = deg % 180;
  if (d < 0) d += 180;
  return d;
}

/** 凸包（Andrewのモノトーンチェイン）。 */
export function convexHull(points: readonly PlaneXY[]): PlaneXY[] {
  const pts = [...points].sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
  if (pts.length < 3) return pts;
  const cross = (o: PlaneXY, a: PlaneXY, b: PlaneXY) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

  const lower: PlaneXY[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: PlaneXY[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/* --------------------------------------------------------- 内外判定 */

/** 点が多角形の内側にあるか（平面直角座標）。 */
export function pointInPolygon(polygon: readonly PlaneXY[], p: PlaneXY): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    const straddles = a.x > p.x !== b.x > p.x;
    if (!straddles) continue;
    const y = ((b.y - a.y) * (p.x - a.x)) / (b.x - a.x) + a.y;
    if (p.y < y) inside = !inside;
  }
  return inside;
}

/** 点から多角形の境界までの最短距離[m]。内外は問わない。 */
export function distanceToBoundary(polygon: readonly PlaneXY[], p: PlaneXY): number {
  let best = Infinity;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    best = Math.min(best, distanceToSegment(p, polygon[j], polygon[i]));
  }
  return best;
}

function distanceToSegment(p: PlaneXY, a: PlaneXY, b: PlaneXY): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-18) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

/**
 * 矩形の4隅がすべて多角形の内側で、かつ境界から `clearanceM` 以上離れているか。
 *
 * 内外判定だけでは辺にぴったり接するマスが通ってしまう。フェンスや土留めの厚みぶん、
 * 境界からの離れも見る。
 */
function rectInside(
  polygon: readonly PlaneXY[],
  corners: readonly PlaneXY[],
  clearanceM: number,
): boolean {
  return corners.every(
    (c) => pointInPolygon(polygon, c) && distanceToBoundary(polygon, c) >= clearanceM - 1e-9,
  );
}

/* --------------------------------------------------------- 割り付け */

export interface ParkingLayoutOptions {
  /** マスの幅[m]。 */
  stallWidthM?: number;
  /** マスの奥行[m]。 */
  stallDepthM?: number;
  /** 車路の幅[m]。省略すると `oneWay` に応じた施行令の下限値。 */
  aisleM?: number;
  /**
   * 車路を一方通行にするか。駐車場法施行令第7条の下限は対面5.5m・一方通行3.5m。
   * 狭い筆では対面が取れないことがある。既定は対面。
   */
  oneWay?: boolean;
  /** 敷地境界から離す距離[m]。フェンスや土留めの厚みぶん。 */
  setbackM?: number;
  /** 割り付ける向き[度]。省略すると最小面積外接矩形の長手方向。 */
  bearingDeg?: number;
}

export interface ParkingLayout {
  bands: StallBand[];
  /** 総台数。 */
  count: number;
  /** 使った向き[度]。 */
  bearingDeg: number;
  /** 車路の中心線。「通路」の注記を置く位置に使う。 */
  aisleCenters: PlaneXY[];
  /** 敷地面積[㎡]。 */
  siteAreaM2: number;
  /** 実際に使った車路幅[m]。画面に出して施行令の下限と突き合わせる。 */
  aisleM: number;
}

/** 向きの総当たりの刻み[度]。 */
export const BEARING_STEP_DEG = 5;

/**
 * 敷地の多角形に区画を割り付ける。
 *
 * マスを並べる向きは**総当たりで決める。** 最初は最小面積外接矩形の長手方向と
 * その直交方向だけを試していたが、実データで測ると取りこぼしが大きかった
 * （鴻巣327で16台→22台、鴻巣441で17台→20台）。実データの筆は矩形ではないので、
 * 外接矩形の向きが最良とは限らない。
 *
 * 同数なら外接矩形の向きを優先する。敷地の形に沿った、見て自然な割り付けになる。
 * `bearingDeg` を渡した場合はその向きだけを使う。
 *
 * 敷地からはみ出すマスは落とすので、隅の欠けた形でも破綻しない。
 */
export function layoutParking(
  outline: readonly PlaneXY[],
  opts: ParkingLayoutOptions = {},
): ParkingLayout {
  if (opts.bearingDeg !== undefined) return layoutParkingAt(outline, opts.bearingDeg, opts);

  const box = minimumAreaRectangle(outline);
  // 外接矩形の向きを先に置く。以降は「厳密に多いときだけ」置き換えるので、
  // 同数ならこちらが残る。
  const candidates = [box.bearingDeg, normaliseBearing(box.bearingDeg + 90)];
  for (let d = 0; d < 180; d += BEARING_STEP_DEG) candidates.push(d);

  let best = layoutParkingAt(outline, candidates[0], opts);
  for (const deg of candidates.slice(1)) {
    const cur = layoutParkingAt(outline, deg, opts);
    if (cur.count > best.count) best = cur;
  }
  return best;
}

/** 向きを1つ決めて割り付ける。 */
function layoutParkingAt(
  outline: readonly PlaneXY[],
  bearingDeg: number,
  opts: ParkingLayoutOptions,
): ParkingLayout {
  const stallW = opts.stallWidthM ?? PARKING_STANDARDS.stall.widthM;
  const stallD = opts.stallDepthM ?? PARKING_STANDARDS.stall.depthM;
  const aisle =
    opts.aisleM ??
    (opts.oneWay ? PARKING_STANDARDS.aisle.oneWayMinM : PARKING_STANDARDS.aisle.twoWayMinM);
  const setback = opts.setbackM ?? 0.5;

  const box = minimumAreaRectangle(outline);
  const rad = (bearingDeg * Math.PI) / 180;
  const along = { x: Math.cos(rad), y: Math.sin(rad) };
  const perp = { x: -Math.sin(rad), y: Math.cos(rad) };

  // 敷地を局所座標(u,v)へ。原点は外接矩形の中心。
  const toLocal = (p: PlaneXY) => ({
    u: (p.x - box.center.x) * along.x + (p.y - box.center.y) * along.y,
    v: (p.x - box.center.x) * perp.x + (p.y - box.center.y) * perp.y,
  });
  const toWorld = (u: number, v: number): PlaneXY => ({
    x: box.center.x + along.x * u + perp.x * v,
    y: box.center.y + along.y * u + perp.y * v,
  });

  const locals = outline.map(toLocal);
  const minU = Math.min(...locals.map((p) => p.u)) + setback;
  const maxU = Math.max(...locals.map((p) => p.u)) - setback;
  const minV = Math.min(...locals.map((p) => p.v)) + setback;
  const maxV = Math.max(...locals.map((p) => p.v)) - setback;

  const bands: StallBand[] = [];
  const aisleCenters: PlaneXY[] = [];

  const empty: ParkingLayout = {
    bands: [], count: 0, bearingDeg, aisleCenters: [], siteAreaM2: polygonArea(outline), aisleM: aisle,
  };

  // 長手方向にマスを並べ、中央寄せにする
  const usable = maxU - minU;
  const columns = Math.floor(usable / stallW);
  if (columns <= 0) return empty;
  // 車路は u 方向に走る。その長さが車路幅にも満たなければ、車の通れる道ではなく
  // 行き止まりの窪みになる。台数だけ増える無意味な配置を防ぐ。
  if (usable < aisle) return empty;
  const u0 = minU + (usable - columns * stallW) / 2;

  /** 1列ぶんの帯を作る。残るマスが無ければ null。 */
  function makeRow(v0: number, facingPositive: boolean): StallBand | null {
    const stalls: Stall[] = [];
    for (let i = 0; i < columns; i++) {
      const ua = u0 + stallW * i;
      const ub = ua + stallW;
      const corners = [toWorld(ua, v0), toWorld(ub, v0), toWorld(ub, v0 + stallD), toWorld(ua, v0 + stallD)];
      if (!rectInside(outline, corners, setback)) continue;
      stalls.push({
        center: toWorld((ua + ub) / 2, v0 + stallD / 2),
        // 車は車路側を向く
        bearingDeg: bearingDeg + (facingPositive ? 90 : -90),
      });
    }
    if (stalls.length === 0) return null;
    const us = stalls.map((s) => toLocal(s.center).u);
    const ua = Math.min(...us) - stallW / 2;
    const ub = Math.max(...us) + stallW / 2;
    return {
      outline: [toWorld(ua, v0), toWorld(ub, v0), toWorld(ub, v0 + stallD), toWorld(ua, v0 + stallD)],
      stalls,
    };
  }

  /**
   * 車路そのものが敷地の内側に収まるか。
   *
   * 局所座標の外接範囲だけで判定すると、向きを斜めに振ったときに
   * 「外接範囲には入るが敷地には入らない」車路を通してしまう。
   * 幅 aisle・長さ（マスの並ぶ範囲）の帯として、実際に敷地に入るかを見る。
   */
  function aisleFits(ua: number, ub: number, v0: number): boolean {
    if (ub - ua < aisle) return false;
    const steps = Math.max(2, Math.ceil((ub - ua) / 1.0));
    for (let i = 0; i <= steps; i++) {
      const u = ua + ((ub - ua) * i) / steps;
      for (const v of [v0, v0 + aisle]) {
        if (!pointInPolygon(outline, toWorld(u, v))) return false;
      }
    }
    return true;
  }

  /** 帯の並びを記録し、車路の注記位置を残す。 */
  function pushAisle(rows: Array<StallBand | null>, v0: number) {
    const us = rows.flatMap((b) => (b ? b.stalls.map((s) => toLocal(s.center).u) : []));
    if (us.length === 0) return;
    // 車路の注記は、実際に残ったマスの真ん中に置く
    aisleCenters.push(toWorld((Math.min(...us) + Math.max(...us)) / 2, v0 + aisle / 2));
  }

  /** その塊のマスが並ぶ u の範囲。車路の長さになる。 */
  function uSpan(rows: Array<StallBand | null>): [number, number] | null {
    const us = rows.flatMap((b) => (b ? b.stalls.map((s) => toLocal(s.center).u) : []));
    if (us.length === 0) return null;
    return [Math.min(...us) - stallW / 2, Math.max(...us) + stallW / 2];
  }

  // 短手方向に「帯・車路・帯」の塊を積む。塊どうしは背中合わせに詰める
  // （それぞれの帯が自分の側の車路を向くので、あいだに車路は要らない）。
  const moduleDepth = stallD * 2 + aisle;
  let v = minV;
  for (;;) {
    if (v + moduleDepth <= maxV) {
      const near = makeRow(v, true);
      const far = makeRow(v + stallD + aisle, false);
      const span = uSpan([near, far]);
      // 車路が敷地に収まらない塊は、マスごと捨てる。
      // 出入りできない区画を台数に数えるのは嘘になる。
      if (span && aisleFits(span[0], span[1], v + stallD)) {
        if (near) bands.push(near);
        if (far) bands.push(far);
        pushAisle([near, far], v + stallD);
      }
      v += moduleDepth;
      continue;
    }
    // 残りに「帯＋車路」だけ入るなら片側だけの列を足す。
    // 車路の付かない帯は出入りできないので作らない。
    if (v + stallD + aisle <= maxV) {
      const row = makeRow(v, true);
      const span = uSpan([row]);
      if (row && span && aisleFits(span[0], span[1], v + stallD)) {
        bands.push(row);
        pushAisle([row], v + stallD);
      }
    }
    break;
  }

  const count = bands.reduce((s, b) => s + b.stalls.length, 0);
  return { bands, count, bearingDeg, aisleCenters, siteAreaM2: polygonArea(outline), aisleM: aisle };
}

/* --------------------------------------------------------- ラベルの置き場所 */

/**
 * 多角形の中で、境界からも障害物からもいちばん離れた点を探す。
 *
 * 申請地の地番・地目・面積・所有者は4行になる。重心に置くと駐車区画の上に重なって
 * 読めなくなるので、空いている地面を探して置く。格子で総当たりしてから細かく詰める。
 */
export function labelSpot(
  polygon: readonly PlaneXY[],
  obstacles: readonly (readonly PlaneXY[])[] = [],
  gridSteps = 48,
): PlaneXY {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of polygon) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0 };

  /** その点の「空き具合」。境界の外や障害物の中は -Infinity。 */
  const clearance = (p: PlaneXY): number => {
    if (!pointInPolygon(polygon, p)) return -Infinity;
    let best = distanceToBoundary(polygon, p);
    for (const o of obstacles) {
      if (pointInPolygon(o, p)) return -Infinity;
      best = Math.min(best, distanceToBoundary(o, p));
    }
    return best;
  };

  let best: PlaneXY | null = null;
  let bestScore = -Infinity;
  const dx = (maxX - minX) / gridSteps;
  const dy = (maxY - minY) / gridSteps;
  for (let i = 0; i <= gridSteps; i++) {
    for (let j = 0; j <= gridSteps; j++) {
      const p = { x: minX + dx * i, y: minY + dy * j };
      const s = clearance(p);
      if (s > bestScore) { bestScore = s; best = p; }
    }
  }
  if (!best) return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };

  // 格子の目より細かく詰める
  let at: PlaneXY = best;
  let step = Math.max(dx, dy) / 2;
  for (let round = 0; round < 6 && step > 0.05; round++, step /= 2) {
    for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const p: PlaneXY = { x: at.x + ox * step, y: at.y + oy * step };
      const s = clearance(p);
      if (s > bestScore) { bestScore = s; at = p; }
    }
  }
  return at;
}
