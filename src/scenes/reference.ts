/**
 * 参考図面（reference/IMG_9055.png）の構図を再現したサンプル。
 *
 * 実データが入るまでのあいだ、描画を作り込んで見比べるための素材。
 * **筆界の座標は写真から目測で起こしたものであり、測量成果ではない。**
 * 地番・地目・面積・所有者は参考図面に書かれている値をそのまま使っている。
 *
 * 敷地は北から時計回りに約62度傾いた向きに置く。参考図面がそうなっているため。
 * 傾けると外接矩形が大きくなるので、周辺を描ける余地はその分狭くなる。
 */

import type { PlaneXY } from '../paper/transform';
import type { Scene, Parcel, Corridor, Building, Edging, Note } from '../draw/scene';
import { makeBand } from '../draw/parking';

/** 埼玉県鴻巣市付近（第IX系）。実在の座標帯で動かすための基準点。 */
const ORIGIN: PlaneXY = { x: 7348.975, y: -28023.951 };

/** 敷地の長手方向の方位角[度]。 */
const THETA_DEG = 62;

const rad = (THETA_DEG * Math.PI) / 180;
const ALONG = { x: Math.cos(rad), y: Math.sin(rad) };
const PERP = { x: -Math.sin(rad), y: Math.cos(rad) };

/** 敷地ローカル座標(u=長手, v=短手) → 平面直角座標。 */
function at(u: number, v: number): PlaneXY {
  return {
    x: ORIGIN.x + ALONG.x * u + PERP.x * v,
    y: ORIGIN.y + ALONG.y * u + PERP.y * v,
  };
}

const path = (pairs: Array<[number, number]>): PlaneXY[] => pairs.map(([u, v]) => at(u, v));

/* ---------------------------------------------------------------- 敷地 */

/** 申請地の外周。参考図面と同じく角を落とした八角形。約1314㎡。 */
const SITE_OUTLINE = path([
  [4, 0], [40, 0], [44, 4], [44, 27], [40, 31], [4, 31], [0, 27], [0, 4],
]);

/** 申請地は2筆。記載面積 590㎡ / 747㎡ に近い比で u=20 で分ける。 */
const PARCEL_44_4: Parcel = {
  chiban: '44-4',
  isSubject: true,
  chimoku: '田',
  areaM2: 590,
  owner: '田中辰弘',
  outline: path([[4, 0], [20, 0], [20, 31], [4, 31], [0, 27], [0, 4]]),
  labelAt: at(8, 6),
};

const PARCEL_90_1: Parcel = {
  chiban: '90-1',
  isSubject: true,
  chimoku: '田',
  areaM2: 747,
  outline: path([[20, 0], [40, 0], [44, 4], [44, 27], [40, 31], [20, 31]]),
  labelAt: at(38.5, 8),
};

/* -------------------------------------------------------------- 隣接地 */

/** 隣接地は地番のみ。参考図面では 32・89・91。 */
const NEIGHBOURS: Parcel[] = [
  { chiban: '89', isSubject: false, outline: path([[2, -16], [50, -16], [50, -5], [2, -5]]), labelAt: at(26, -11) },
  { chiban: '32', isSubject: false, outline: path([[-16, -10], [-8, -10], [-8, 20], [-16, 20]]), labelAt: at(-12, 6) },
  { chiban: '91', isSubject: false, outline: path([[48, 2], [60, 2], [60, 30], [48, 30]]), labelAt: at(50, 4) },
];

/* ------------------------------------------------------- 市道・用悪水路 */

const CORRIDORS: Corridor[] = [
  {
    kind: 'road', name: '市道', widthM: 4.0, keba: true,
    centerline: path([[-14, -2.5], [50, -2.5]]),
    labelAt: at(16, -4.6),
  },
  {
    kind: 'road', name: '市道', widthM: 4.0, keba: true,
    centerline: path([[-5.5, -8], [-5.5, 22]]),
    labelAt: at(-7.6, 14),
  },
  {
    kind: 'waterway', name: '用悪水路', widthM: 2.0,
    centerline: path([[-2, 33], [46, 33]]),
    labelAt: at(38, 35),
  },
  {
    kind: 'waterway', name: '用悪水路', widthM: 2.0,
    centerline: path([[-2, 33], [-2, 8]]),
    labelAt: at(-4.5, 22),
  },
];

/* ---------------------------------------------------------------- 隣家 */

const BUILDINGS: Building[] = [
  { outline: path([[50, 6], [57, 6], [57, 11], [60, 11], [60, 18], [53, 18], [53, 13], [50, 13]]) },
  { outline: path([[49, 22], [56, 22], [56, 29], [49, 29]]) },
];

/* --------------------------------------------------- フェンス・土留め */

const EDGINGS: Edging[] = [
  // 外周のフェンス（玉鎖線）
  { kind: 'fence', path: SITE_OUTLINE.concat([SITE_OUTLINE[0]]) },
  // 南東側と南西側の土留め。境界から外向きにT字を出す。
  { kind: 'retaining', path: path([[4, 31], [40, 31]]), outwardLeft: false },
  { kind: 'retaining', path: path([[0, 4], [0, 27]]), outwardLeft: true },
];

/* ------------------------------------------------------------ 駐車区画 */

/** 参考図面はおよそ23台。車路の両側に帯を並べた形。 */
const BANDS = [
  // 北西寄りの帯（5台）
  makeBand({ origin: at(21, 2), runBearingDeg: THETA_DEG, count: 5, depthLeft: false }),
  // 中央の背中合わせ2帯（7台ずつ）
  makeBand({ origin: at(14, 12.5), runBearingDeg: THETA_DEG, count: 7, depthLeft: false }),
  makeBand({ origin: at(14, 22.5), runBearingDeg: THETA_DEG, count: 7, depthLeft: true }),
  // 南西寄りの帯（4台）
  makeBand({ origin: at(3, 24), runBearingDeg: THETA_DEG, count: 4, depthLeft: false }),
];

/* -------------------------------------------------------- 集水桝・注記 */

const BASINS: PlaneXY[] = [at(-1.5, 32), at(42, 32)];

const NOTES: Note[] = [
  { text: '通路', at: at(35, 9.5), sizeMm: 3.0 },
  { text: '通路', at: at(35, 19.5), sizeMm: 3.0 },
  { text: '通路', at: at(12, -1.6), sizeMm: 2.6, leaderTo: at(10, 0.4) },
];

export function referenceScene(): Scene {
  return {
    parcels: [PARCEL_44_4, PARCEL_90_1, ...NEIGHBOURS],
    corridors: CORRIDORS,
    buildings: BUILDINGS,
    edgings: EDGINGS,
    bands: BANDS,
    basins: BASINS,
    notes: NOTES,
  };
}

/** 敷地（申請地2筆）の外周。用紙配置の基準に使う。 */
export const SITE_BOUNDARY = SITE_OUTLINE;
