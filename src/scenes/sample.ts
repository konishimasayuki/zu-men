/**
 * 依頼者の対象地に近い規模のサンプル。
 *
 * 90坪（297.5㎡）と143坪（472.7㎡）の2件。参考図面の敷地は約404坪あり、
 * 依頼者の土地の3倍近い。用紙に収まるかの検討は、参考図面ではなく
 * こちらの規模で行う。
 *
 * **座標は実測値ではない。** 実データが入るまでの検討用。
 */

import type { PlaneXY } from '../paper/transform';
import type { Scene, Parcel, Corridor, Building, Edging, Note } from '../draw/scene';
import { makeBand, DEFAULT_STALL } from '../draw/parking';
import { tsuboToM2 } from '../draw/tsubo';

export interface SampleSpec {
  /**
   * 敷地の中心となる平面直角座標。
   * 地図で指したピンの位置がここに入る。省略すると既定の基準点。
   */
  center?: PlaneXY;
  /** 敷地面積[坪]。 */
  tsubo: number;
  /** 地番。 */
  chiban: string;
  /** 地目。 */
  chimoku: string;
  /** 所有者名。 */
  owner: string;
  /** 敷地の長手方向の方位角[度]。90に近いほど東西に長い。 */
  bearingDeg: number;
  /** 長手と短手の比。 */
  aspect: number;
  /** 駐車の帯1本あたりの台数。 */
  stallsPerBand: number;
  /** 帯の本数。 */
  bandCount: number;
}

export const SAMPLE_90: SampleSpec = {
  tsubo: 90, chiban: '90-1', chimoku: '田', owner: '田中辰弘',
  bearingDeg: 75, aspect: 1.5, stallsPerBand: 6, bandCount: 2,
};

export const SAMPLE_143: SampleSpec = {
  tsubo: 143, chiban: '44-4', chimoku: '田', owner: '田中辰弘',
  bearingDeg: 80, aspect: 1.45, stallsPerBand: 8, bandCount: 2,
};

/** 既定の基準点。埼玉県鴻巣市付近（第IX系）。 */
const DEFAULT_CENTER: PlaneXY = { x: 7348.975, y: -28023.951 };

/**
 * 敷地とその周辺を組み立てる。
 *
 * `center` は敷地の中心。地図で指したピンの位置をそのまま渡す。
 * 敷地はこの点を中心に置かれ、周辺もこの点を基準に広がる。
 */
export function makeSampleScene(spec: SampleSpec): Scene {
  const areaM2 = tsuboToM2(spec.tsubo);
  // 長手 L、短手 W。L = W * aspect、L*W = areaM2
  const shortM = Math.sqrt(areaM2 / spec.aspect);
  const longM = shortM * spec.aspect;

  const rad = (spec.bearingDeg * Math.PI) / 180;
  const along = { x: Math.cos(rad), y: Math.sin(rad) };
  const perp = { x: -Math.sin(rad), y: Math.cos(rad) };
  const c = spec.center ?? DEFAULT_CENTER;
  // ローカル座標(u,v)の原点は敷地の左下隅。center が敷地の中心に来るようずらす。
  const ox = c.x - (along.x * longM) / 2 - (perp.x * shortM) / 2;
  const oy = c.y - (along.y * longM) / 2 - (perp.y * shortM) / 2;
  const at = (u: number, v: number): PlaneXY => ({
    x: ox + along.x * u + perp.x * v,
    y: oy + along.y * u + perp.y * v,
  });
  const path = (pairs: Array<[number, number]>): PlaneXY[] => pairs.map(([u, v]) => at(u, v));

  const L = longM;
  const W = shortM;

  /* 敷地。角を少し落とす。 */
  const cut = Math.min(2.5, W * 0.15);
  const outline = path([
    [cut, 0], [L - cut, 0], [L, cut], [L, W - cut], [L - cut, W], [cut, W], [0, W - cut], [0, cut],
  ]);

  const subject: Parcel = {
    chiban: spec.chiban,
    isSubject: true,
    chimoku: spec.chimoku,
    areaM2: Math.round(areaM2),
    owner: spec.owner,
    outline,
    labelAt: at(L * 0.18, W * 0.5),
  };

  /*
   * 周辺。1/250のA4図郭は 65.5×45.0m。敷地を斜めに置くと外接矩形が伸びるので、
   * 短手方向（v）に取れる周辺は長手方向（u）よりかなり狭い。
   */
  const neighbours: Parcel[] = [
    { chiban: '89', isSubject: false, outline: path([[0, -9], [L, -9], [L, -6], [0, -6]]), labelAt: at(L * 0.5, -7.6) },
    { chiban: '32', isSubject: false, outline: path([[-12, -6], [-6, -6], [-6, W + 4], [-12, W + 4]]), labelAt: at(-9, W * 0.5) },
    { chiban: '91', isSubject: false, outline: path([[L + 6, -2], [L + 15, -2], [L + 15, W + 4], [L + 6, W + 4]]), labelAt: at(L + 8, 0) },
  ];

  /* 市道は敷地の北西側と西側。用悪水路は南東側。 */
  const corridors: Corridor[] = [
    {
      kind: 'road', name: '市道', widthM: 5.0, keba: true,
      centerline: path([[-12, -3.2], [L + 15, -3.2]]),
      labelAt: at(L * 0.62, -5.6),
    },
    {
      kind: 'waterway', name: '用悪水路', widthM: 2.0,
      centerline: path([[-6, W + 2], [L + 6, W + 2]]),
      labelAt: at(L * 0.62, W + 4),
    },
  ];

  const buildings: Building[] = [
    { outline: path([[L + 8, 3], [L + 14, 3], [L + 14, 9], [L + 8, 9]]) },
  ];

  const edgings: Edging[] = [
    { kind: 'fence', path: outline.concat([outline[0]]) },
    { kind: 'retaining', path: path([[cut, W], [L - cut, W]]), outwardLeft: false },
  ];

  /* 駐車区画。車路をはさんで帯を向かい合わせる。 */
  const stallW = DEFAULT_STALL.widthM;
  const stallD = DEFAULT_STALL.depthM;
  const aisle = DEFAULT_STALL.aisleM;
  const bandRun = stallW * spec.stallsPerBand;
  const uStart = (L - bandRun) / 2;
  // 帯・車路・帯 の合計奥行きを敷地の中央に置く
  const totalDepth = stallD * spec.bandCount + aisle * (spec.bandCount - 1);
  const vStart = (W - totalDepth) / 2;

  const bands = [];
  for (let i = 0; i < spec.bandCount; i++) {
    const v = vStart + i * (stallD + aisle);
    bands.push(
      makeBand({
        origin: at(uStart, i === 0 ? v : v + stallD),
        runBearingDeg: spec.bearingDeg,
        count: spec.stallsPerBand,
        // 1本目は奥へ、2本目は手前へ伸ばして車路をはさむ
        depthLeft: i !== 0,
      }),
    );
  }

  const notes: Note[] = [
    { text: '通路', at: at(L * 0.5, vStart + stallD + aisle / 2), sizeMm: 3.0 },
    { text: '進入口', at: at(uStart - 3.5, -1.5), sizeMm: 2.6, leaderTo: at(uStart - 1.5, 0.3) },
  ];

  const basins: PlaneXY[] = [at(cut + 1, W + 1), at(L - cut - 1, W + 1)];

  return {
    parcels: [subject, ...neighbours], corridors, buildings, edgings, bands, basins, notes,
    arrows: [],
  };
}
