/**
 * 敷地の外周を辺に分解し、進入口と排水を組み立てる。
 *
 * **どの辺が道路でどの辺が水路かは、このデータからは分からない。**
 * 登記所備付地図が持つのは筆界と地番だけで、地目は入っていない。
 * 鴻巣市の実データで確かめたところ、道路や水路もすべて登記された筆として
 * 隣接しており、「隣に筆が無い側が道路」という推定は成り立たなかった
 * （327・441・312・362-7 のすべての辺が隣接筆に接していた）。
 *
 * したがって道路側・放流先は**画面で選ばせる。** ここでは選ばれた辺をもとに
 * 進入口・隅切り・側溝・集水桝・排水の矢印を組み立てるだけにする。
 * 既定値は置くが、それは推定ではなく「とりあえずの初期選択」である。
 */

import type { PlaneXY } from '../paper/transform';
import type { Edging, FlowArrow, StallBand } from './scene';
import { pointInPolygon } from './layout';

/* --------------------------------------------------------- 外周の辺 */

export interface SiteEdge {
  /** 外周の何番目の辺か。 */
  index: number;
  a: PlaneXY;
  b: PlaneXY;
  /** 辺の中点。 */
  mid: PlaneXY;
  /** 辺の長さ[m]。 */
  lengthM: number;
  /** 敷地の外を向く単位ベクトル。 */
  outward: PlaneXY;
  /** その辺の外側にある隣接筆の地番。分からなければ null。 */
  neighbourChiban: string | null;
}

export interface NeighbourPolygon {
  chiban: string;
  outline: readonly PlaneXY[];
}

/** 短すぎる辺は測量上の折れであって「面」ではない。進入口の候補から外す。 */
export const MIN_EDGE_M = 1.0;

/**
 * 外周を辺に分解し、各辺の外向き法線と、その外側にある隣接筆を求める。
 *
 * 外向きの向きは多角形の回り方に依存する。回り方を仮定せず、
 * 法線を伸ばした点が敷地の内側かどうかで判定して決める。
 */
export function boundaryEdges(
  outline: readonly PlaneXY[],
  neighbours: readonly NeighbourPolygon[] = [],
  probeM = 1.0,
): SiteEdge[] {
  const n = outline.length;
  const edges: SiteEdge[] = [];
  for (let i = 0; i < n; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % n];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthM = Math.hypot(dx, dy);
    if (lengthM < 1e-9) continue;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };

    // 辺を右に90度回した向きを仮の外向きとし、内側だったら反転する
    let outward = { x: dy / lengthM, y: -dx / lengthM };
    const probe = (o: PlaneXY, d: number) => ({ x: mid.x + o.x * d, y: mid.y + o.y * d });
    if (pointInPolygon(outline, probe(outward, Math.min(probeM, lengthM / 4)))) {
      outward = { x: -outward.x, y: -outward.y };
    }

    const p = probe(outward, probeM);
    const hit = neighbours.find((q) => pointInPolygon(q.outline, p));
    edges.push({ index: i, a, b, mid, lengthM, outward, neighbourChiban: hit?.chiban ?? null });
  }
  return edges;
}

/**
 * 進入口を置く辺の既定値。**推定ではなく初期選択。**
 *
 * いちばん長い辺を選ぶ。長い辺が道路に面していることが多いという経験則であり、
 * 根拠のある規則ではない。画面で必ず選び直せるようにすること。
 */
export function defaultEntranceEdge(edges: readonly SiteEdge[]): SiteEdge | null {
  let best: SiteEdge | null = null;
  for (const e of edges) {
    if (e.lengthM < MIN_EDGE_M) continue;
    if (!best || e.lengthM > best.lengthM) best = e;
  }
  return best;
}

/* --------------------------------------------------------- 進入口と隅切り */

export interface EntrancePlan {
  /** 進入口の開口部。辺の上の2点。 */
  opening: [PlaneXY, PlaneXY];
  /** 開口の中心。注記の指し先。 */
  center: PlaneXY;
  /** 開口の幅[m]。 */
  widthM: number;
  /** 隅切りの線。開口の両端から斜めに入る。無ければ空。 */
  cornerCuts: Array<[PlaneXY, PlaneXY]>;
  /** 進入口で切れた外周（フェンスを回す経路）。 */
  fencePaths: PlaneXY[][];
}

export interface EntranceOptions {
  /** 開口の幅[m]。 */
  widthM?: number;
  /** 隅切りの一辺[m]。0で隅切りを描かない。 */
  cornerCutM?: number;
}

/** 車路が対面通行なら開口も対面通行ぶん要る。既定は車路と同じ4.0m。 */
export const DEFAULT_ENTRANCE_WIDTH_M = 4.0;
/** 隅切りの既定。道路と敷地の取り付け部の面取り。 */
export const DEFAULT_CORNER_CUT_M = 1.0;

/**
 * 指定した辺の中央に進入口を開け、外周のフェンスをそこで切る。
 *
 * フェンスが進入口を横切っていると車が入れない図面になる。開口のぶんだけ
 * 経路を2本に割り、それぞれを別の折れ線として返す。
 */
export function planEntrance(
  outline: readonly PlaneXY[],
  edge: SiteEdge,
  opts: EntranceOptions = {},
): EntrancePlan {
  const width = Math.min(opts.widthM ?? DEFAULT_ENTRANCE_WIDTH_M, edge.lengthM * 0.9);
  const cut = opts.cornerCutM ?? DEFAULT_CORNER_CUT_M;

  const ux = (edge.b.x - edge.a.x) / edge.lengthM;
  const uy = (edge.b.y - edge.a.y) / edge.lengthM;
  const half = width / 2;
  const at = (t: number): PlaneXY => ({ x: edge.mid.x + ux * t, y: edge.mid.y + uy * t });
  const p0 = at(-half);
  const p1 = at(half);

  // 隅切り。開口の端でフェンスを敷地の**内側**へ折り、取り付け部を広げる。
  // 外側へ折ると敷地の外にフェンスを描くことになる。
  const inward = { x: -edge.outward.x, y: -edge.outward.y };
  const cornerCuts: Array<[PlaneXY, PlaneXY]> = [];
  if (cut > 0 && edge.lengthM > width + cut * 2) {
    cornerCuts.push([p0, { x: at(-half - cut).x + inward.x * cut, y: at(-half - cut).y + inward.y * cut }]);
    cornerCuts.push([p1, { x: at(half + cut).x + inward.x * cut, y: at(half + cut).y + inward.y * cut }]);
  }

  // 外周を進入口で切る。edge.a → p0 で1本、p1 → edge.b →（1周）→ edge.a で1本。
  const n = outline.length;
  const tail: PlaneXY[] = [p1];
  for (let k = 1; k <= n; k++) tail.push(outline[(edge.index + k) % n]);
  tail.push(p0);

  return {
    opening: [p0, p1],
    center: edge.mid,
    widthM: width,
    cornerCuts,
    fencePaths: [tail],
  };
}

/* --------------------------------------------------------- 排水 */

export interface DrainagePlan {
  /** 集水桝の位置。 */
  basins: PlaneXY[];
  /** 区画から桝へ、桝から放流先への矢印。 */
  arrows: FlowArrow[];
  /** 側溝。放流先の辺に沿って敷地の内側に引く。 */
  gutter: Edging | null;
  /** 放流先の辺。 */
  edge: SiteEdge;
}

export interface DrainageOptions {
  /**
   * 側溝と集水桝を敷地境界から何メートル内側に引くか。
   * 1/250では0.5mが紙上2mm。集水桝の記号(2.2mm)が境界線をまたいでしまうので、
   * 記号がはっきり内側に収まる1.0mを既定とする。
   */
  insetM?: number;
  /** 集水桝の数。既定は2。 */
  basinCount?: number;
}

/**
 * 雨水の排水を組み立てる。
 *
 * 舗装すると雨水が浸透しなくなる。**隣接農地へ流さないこと**が審査上の最大の論点なので、
 * 放流先の辺に側溝を引き、区画からそこへ向かう矢印を描く。
 * 矢印は必ず放流先を向く。隣接農地の側を向く矢印を作らない。
 */
export function planDrainage(
  bands: readonly StallBand[],
  edge: SiteEdge,
  opts: DrainageOptions = {},
): DrainagePlan {
  const inset = opts.insetM ?? 1.0;
  const count = Math.max(1, opts.basinCount ?? 2);

  const ux = (edge.b.x - edge.a.x) / edge.lengthM;
  const uy = (edge.b.y - edge.a.y) / edge.lengthM;
  const inward = { x: -edge.outward.x, y: -edge.outward.y };
  const on = (t: number, d: number): PlaneXY => ({
    x: edge.a.x + ux * t + inward.x * d,
    y: edge.a.y + uy * t + inward.y * d,
  });

  // 側溝は放流先の辺に沿って、敷地の内側に引く
  const gutter: Edging = {
    kind: 'gutter',
    path: [on(inset, inset), on(edge.lengthM - inset, inset)],
  };

  // 集水桝は側溝の上に等間隔で置く
  const basins: PlaneXY[] = [];
  for (let i = 1; i <= count; i++) {
    basins.push(on((edge.lengthM * i) / (count + 1), inset));
  }

  // 区画の中心から、いちばん近い桝へ向かう矢印
  const arrows: FlowArrow[] = [];
  for (const band of bands) {
    if (band.stalls.length === 0) continue;
    const c = {
      x: band.stalls.reduce((s, q) => s + q.center.x, 0) / band.stalls.length,
      y: band.stalls.reduce((s, q) => s + q.center.y, 0) / band.stalls.length,
    };
    let target = basins[0];
    let bestD = Infinity;
    for (const b of basins) {
      const d = Math.hypot(b.x - c.x, b.y - c.y);
      if (d < bestD) { bestD = d; target = b; }
    }
    if (bestD < 1e-6) continue;
    arrows.push({ from: c, to: target, kind: 'drainage' });
  }

  return { basins, arrows, gutter, edge };
}
