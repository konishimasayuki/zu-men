/**
 * 図面の中身。
 *
 * 座標はすべて平面直角座標[m]（X=北・Y=東）。紙やmmはここに出てこない。
 * 用紙・縮尺・配置は描画側が持ち、この構造は「どこに何があるか」だけを持つ。
 * 第1段階で登記所備付地図から作り、第2段階以降で駐車区画や付帯施設が加わる。
 */

import type { PlaneXY } from '../paper/transform';

/** 筆。申請地にも隣接地にも使う。 */
export interface Parcel {
  /** 地番。「44-4」など。 */
  chiban: string;
  /** 外周。反時計回り。 */
  outline: PlaneXY[];
  /** 申請地かどうか。隣接地は地番だけを記入する。 */
  isSubject: boolean;
  /** 地目。申請地のみ記入する。 */
  chimoku?: string;
  /** 面積[㎡]。省略すると座標法で計算した値を使う。 */
  areaM2?: number;
  /** 所有者名。申請地のみ記入する。 */
  owner?: string;
  /** ラベルの位置。省略すると重心に置く。 */
  labelAt?: PlaneXY;
}

/** 市道や用悪水路のような帯状の地物。中心線と幅で持つ。 */
export interface Corridor {
  kind: 'road' | 'waterway';
  /** 表示名。「市道」「用悪水路」。 */
  name: string;
  /** 中心線。 */
  centerline: PlaneXY[];
  /** 幅[m]。 */
  widthM: number;
  /** 名称ラベルの位置。省略すると中心線の中ほどに置く。 */
  labelAt?: PlaneXY;
  /** 縁にケバを付けるか。参考図面の市道・水路には法面のケバが入る。 */
  keba?: boolean;
}

/** 隣家などの建物。輪郭にケバを付けて描く。 */
export interface Building {
  outline: PlaneXY[];
}

/** 敷地外周のフェンスや土留め。 */
export interface Edging {
  kind: 'fence' | 'retaining';
  path: PlaneXY[];
  /** 土留めのT字を進行方向のどちら側へ出すか。 */
  outwardLeft?: boolean;
}

/** 駐車マス1台分。 */
export interface Stall {
  /** マスの中心。 */
  center: PlaneXY;
  /** 車の前方向。方位角[度]（真北から時計回り）。 */
  bearingDeg: number;
  /** 車を描くか。区画だけ描いて車を置かない場合がある。 */
  withCar?: boolean;
}

/** 区画の帯。参考図面ではマスの割り線は引かず、帯の外形だけを描いている。 */
export interface StallBand {
  outline: PlaneXY[];
  stalls: Stall[];
}

/** 図面上の自由な注記。「通路」など。 */
export interface Note {
  text: string;
  at: PlaneXY;
  /** 文字の向き[度]。0で水平。 */
  rotationDeg?: number;
  /** 文字サイズ[mm]。紙の上での大きさなのでmmで持つ。 */
  sizeMm?: number;
  /** 引出し線を引く場合の指し先。 */
  leaderTo?: PlaneXY;
}

export interface Scene {
  parcels: Parcel[];
  corridors: Corridor[];
  buildings: Building[];
  edgings: Edging[];
  bands: StallBand[];
  /** 集水桝の位置。 */
  basins: PlaneXY[];
  notes: Note[];
}

export function emptyScene(): Scene {
  return { parcels: [], corridors: [], buildings: [], edgings: [], bands: [], basins: [], notes: [] };
}

/** 図面に出てくるすべての点。用紙に収まるかの判定に使う。 */
export function allPoints(scene: Scene): PlaneXY[] {
  const pts: PlaneXY[] = [];
  for (const p of scene.parcels) pts.push(...p.outline);
  for (const c of scene.corridors) pts.push(...c.centerline);
  for (const b of scene.buildings) pts.push(...b.outline);
  for (const e of scene.edgings) pts.push(...e.path);
  for (const b of scene.bands) pts.push(...b.outline);
  pts.push(...scene.basins);
  for (const n of scene.notes) pts.push(n.at);
  return pts;
}

export interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  /** 東西方向の広がり[m]。 */
  widthM: number;
  /** 南北方向の広がり[m]。 */
  heightM: number;
}

/**
 * 申請地だけの広がり。
 *
 * 用紙に収まるかは申請地で判断する。周辺の筆は図郭の外まで続いていて当然で、
 * 図郭でクリップして端で切る前提だから、これを収まり判定に混ぜてはいけない。
 * 混ぜると実データではほぼ必ず「収まらない」になる。
 */
export function subjectBoundsOf(scene: Scene): Bounds | null {
  const pts = scene.parcels.filter((p) => p.isSubject).flatMap((p) => p.outline);
  for (const b of scene.bands) pts.push(...b.outline);
  return boundsOfPoints(pts);
}

export function boundsOf(scene: Scene): Bounds | null {
  return boundsOfPoints(allPoints(scene));
}

function boundsOfPoints(pts: readonly PlaneXY[]): Bounds | null {
  if (pts.length === 0) return null;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  return { minX, maxX, minY, maxY, widthM: maxY - minY, heightM: maxX - minX };
}

/** 多角形の重心（面積重心）。ラベルの既定位置に使う。 */
export function centroid(points: readonly PlaneXY[]): PlaneXY {
  const n = points.length;
  if (n === 0) return { x: 0, y: 0 };
  if (n < 3) {
    return {
      x: points.reduce((s, p) => s + p.x, 0) / n,
      y: points.reduce((s, p) => s + p.y, 0) / n,
    };
  }
  let a2 = 0, cx = 0, cy = 0;
  for (let i = 0; i < n; i++) {
    const p = points[i];
    const q = points[(i + 1) % n];
    const cross = p.x * q.y - q.x * p.y;
    a2 += cross;
    cx += (p.x + q.x) * cross;
    cy += (p.y + q.y) * cross;
  }
  if (a2 === 0) {
    return {
      x: points.reduce((s, p) => s + p.x, 0) / n,
      y: points.reduce((s, p) => s + p.y, 0) / n,
    };
  }
  return { x: cx / (3 * a2), y: cy / (3 * a2) };
}
