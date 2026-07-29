/**
 * JGD2011 平面直角座標系。
 *
 * 19の系はいずれも横メルカトル図法、縮尺係数0.9999、原点のX・Yは0。
 * 原点の緯度経度は測量法施行令第9条で定められている。
 * 本ファイルの値は PROJ 9.5.1 のEPSGデータベース（EPSG:6669〜6687）から
 * 取り出したものであり、記憶で書いたものではない。
 * `scripts/genCrsFixtures.ts` が同じデータベースと突き合わせる検証値を作る。
 *
 * **軸の順序に注意。** 平面直角座標系は X=北・Y=東 だが、
 * proj4 の出力は [easting, northing] = [Y, X] の順である。
 * 本モジュールが入れ替えを吸収し、外にはX=北・Y=東で渡す。
 */

import proj4 from 'proj4';
import type { Converter } from 'proj4';
import type { PlaneXY } from '../paper/transform';

/** 系番号。1〜19。 */
export type ZoneNumber =
  | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10
  | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19;

export const ZONE_NUMBERS: readonly ZoneNumber[] = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
];

/** 度分から十進度へ。原点の値は分単位までしかないので秒は取らない。 */
const dm = (deg: number, min: number): number => deg + min / 60;

export interface ZoneDefinition {
  zone: ZoneNumber;
  /** JGD2011 のEPSGコード。 */
  epsg: number;
  /** 原点の緯度[度]。 */
  originLat: number;
  /** 原点の経度[度]。 */
  originLon: number;
  /** ローマ数字表記。図面や画面での表示に使う。 */
  roman: string;
  /** 適用区域の説明。画面で確認させるときに出す。 */
  area: string;
}

export const ZONE_DEFINITIONS: Readonly<Record<ZoneNumber, ZoneDefinition>> = {
  1: { zone: 1, epsg: 6669, originLat: 33, originLon: dm(129, 30), roman: 'I', area: '長崎県、鹿児島県の一部（南西諸島の一部）' },
  2: { zone: 2, epsg: 6670, originLat: 33, originLon: dm(131, 0), roman: 'II', area: '福岡県、佐賀県、熊本県、大分県、宮崎県、鹿児島県（本土）' },
  3: { zone: 3, epsg: 6671, originLat: 36, originLon: dm(132, 10), roman: 'III', area: '山口県、島根県、広島県' },
  4: { zone: 4, epsg: 6672, originLat: 33, originLon: dm(133, 30), roman: 'IV', area: '香川県、愛媛県、徳島県、高知県' },
  5: { zone: 5, epsg: 6673, originLat: 36, originLon: dm(134, 20), roman: 'V', area: '兵庫県、鳥取県、岡山県' },
  6: { zone: 6, epsg: 6674, originLat: 36, originLon: dm(136, 0), roman: 'VI', area: '京都府、大阪府、福井県、滋賀県、三重県、奈良県、和歌山県' },
  7: { zone: 7, epsg: 6675, originLat: 36, originLon: dm(137, 10), roman: 'VII', area: '石川県、富山県、岐阜県、愛知県' },
  8: { zone: 8, epsg: 6676, originLat: 36, originLon: dm(138, 30), roman: 'VIII', area: '新潟県、長野県、山梨県、静岡県' },
  9: { zone: 9, epsg: 6677, originLat: 36, originLon: dm(139, 50), roman: 'IX', area: '東京都（島嶼を除く）、福島県、栃木県、茨城県、埼玉県、千葉県、群馬県、神奈川県' },
  10: { zone: 10, epsg: 6678, originLat: 40, originLon: dm(140, 50), roman: 'X', area: '青森県、秋田県、山形県、岩手県、宮城県' },
  11: { zone: 11, epsg: 6679, originLat: 44, originLon: dm(140, 15), roman: 'XI', area: '北海道の西部（渡島・檜山・後志・石狩・空知・上川の一部）' },
  12: { zone: 12, epsg: 6680, originLat: 44, originLon: dm(142, 15), roman: 'XII', area: '北海道の中部（上川・留萌・宗谷・日高・十勝の一部）' },
  13: { zone: 13, epsg: 6681, originLat: 44, originLon: dm(144, 15), roman: 'XIII', area: '北海道の東部（網走・根室・釧路の一部）' },
  14: { zone: 14, epsg: 6682, originLat: 26, originLon: dm(142, 0), roman: 'XIV', area: '東京都小笠原村（父島・母島）' },
  15: { zone: 15, epsg: 6683, originLat: 26, originLon: dm(127, 30), roman: 'XV', area: '沖縄県本島周辺' },
  16: { zone: 16, epsg: 6684, originLat: 26, originLon: dm(124, 0), roman: 'XVI', area: '沖縄県先島諸島' },
  17: { zone: 17, epsg: 6685, originLat: 26, originLon: dm(131, 0), roman: 'XVII', area: '沖縄県大東諸島' },
  18: { zone: 18, epsg: 6686, originLat: 20, originLon: dm(136, 0), roman: 'XVIII', area: '東京都沖ノ鳥島' },
  19: { zone: 19, epsg: 6687, originLat: 26, originLon: dm(154, 0), roman: 'XIX', area: '東京都南鳥島' },
};

/** 縮尺係数。全系共通。 */
export const SCALE_FACTOR = 0.9999;

const WGS84 = '+proj=longlat +datum=WGS84 +no_defs';

function proj4Def(d: ZoneDefinition): string {
  return (
    `+proj=tmerc +lat_0=${d.originLat} +lon_0=${d.originLon} ` +
    `+k=${SCALE_FACTOR} +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs`
  );
}

const converters = new Map<ZoneNumber, Converter>();

function converterFor(zone: ZoneNumber): Converter {
  let c = converters.get(zone);
  if (!c) {
    c = proj4(WGS84, proj4Def(ZONE_DEFINITIONS[zone]));
    converters.set(zone, c);
  }
  return c;
}

export interface LonLat {
  lon: number;
  lat: number;
}

/**
 * 緯度経度 → 平面直角座標[m]。返る値は X=北・Y=東。
 *
 * CLAUDE.md「絶対に守る制約」5 のとおり、面積計算はこの変換を通してから行う。
 */
export function toPlaneXY(p: LonLat, zone: ZoneNumber): PlaneXY {
  const [easting, northing] = converterFor(zone).forward([p.lon, p.lat]);
  return { x: northing, y: easting };
}

/** 平面直角座標[m] → 緯度経度。 */
export function toLonLat(p: PlaneXY, zone: ZoneNumber): LonLat {
  const [lon, lat] = converterFor(zone).inverse([p.y, p.x]);
  return { lon, lat };
}

/** 系の定義を取り出す。 */
export function zoneDefinition(zone: ZoneNumber): ZoneDefinition {
  return ZONE_DEFINITIONS[zone];
}

/** 「第IX系（EPSG:6677）」のような表示用文字列。 */
export function zoneLabel(zone: ZoneNumber): string {
  const d = ZONE_DEFINITIONS[zone];
  return `第${d.roman}系（系番号${d.zone}・EPSG:${d.epsg}）`;
}
