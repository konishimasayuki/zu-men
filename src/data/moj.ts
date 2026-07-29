/**
 * 法務省 登記所備付地図データ（G空間情報センターのGeoJSON版）の読み込み。
 *
 * 属性はすべて実データ（鴻巣市 2025年版）を見て決めた。憶測ではない。
 *
 * ```
 * "crs": { "type": "name", "properties": { "name": "urn:ogc:def:crs:OGC::CRS84" } }
 * "properties": {
 *   "ID": "H000000122", "市区町村C": "11217",
 *   "大字コード": "048", "丁目コード": "000", "小字コード": "0000", "予備コード": "00",
 *   "市区町村名": "鴻巣市", "大字名": "氷川町", "地番": "173",
 *   "精度区分": "甲二", "座標値種別": "測量成果",
 *   "地図名": "鴻巣市原馬室・滝馬室土地区画整理",
 *   "座標系": "公共座標9系", "測地系判別": "測量"
 * }
 * ```
 *
 * **座標は CRS84（経度緯度）である。** 平面直角座標ではない。
 * 面積計算に使う前に必ず `geo/crs.ts` で平面直角座標へ変換する。
 *
 * **地目・面積・所有者はこのデータに入っていない。** 登記所備付地図が持つのは
 * 筆界と地番まで。地目と所有者は登記事項証明書から、面積は座標法か公簿から入れる。
 */

import type { LonLat, ZoneNumber } from '../geo/crs';

/** 座標値種別。求積に使えるかどうかの判断はこれで行う。 */
export type CoordKind = '測量成果' | '図上測量' | 'その他';

/** 精度区分。地籍測量の区分で、甲一がもっとも精度が高い。 */
export type PrecisionClass = '甲一' | '甲二' | '甲三' | '乙一' | '乙二' | '乙三' | 'その他';

export interface MojParcel {
  /** データ内の一意なID。 */
  id: string;
  /** 市区町村コード。 */
  cityCode: string;
  cityName: string;
  /** 大字名。 */
  oaza: string;
  /** 地番。「173」「44-4」など。 */
  chiban: string;
  /** 「氷川町173」のような表示用の文字列。 */
  label: string;
  precision: PrecisionClass;
  coordKind: CoordKind;
  /** 地図名。区画整理の名称などが入る。 */
  mapName: string;
  /** 平面直角座標系の系番号。「公共座標9系」から取り出す。 */
  zone: ZoneNumber | null;
  /** 測地系判別。「測量」または「変換」。 */
  datumKind: string;
  /** 外周。経度緯度。穴（内周）は使わないので外周のみ持つ。 */
  outline: LonLat[];
}

export interface MojLoadResult {
  /** ファイル名から取れる表題。 */
  name: string;
  parcels: MojParcel[];
  /** 読み飛ばした地物の数と理由。 */
  skipped: { reason: string; count: number }[];
}

const PRECISIONS: PrecisionClass[] = ['甲一', '甲二', '甲三', '乙一', '乙二', '乙三'];

function toPrecision(v: unknown): PrecisionClass {
  return typeof v === 'string' && (PRECISIONS as string[]).includes(v) ? (v as PrecisionClass) : 'その他';
}

function toCoordKind(v: unknown): CoordKind {
  if (v === '測量成果' || v === '図上測量') return v;
  return 'その他';
}

/** 「公共座標9系」→ 9。取れなければ null。 */
export function parseZone(coordSystem: unknown): ZoneNumber | null {
  if (typeof coordSystem !== 'string') return null;
  const m = coordSystem.match(/(\d+)\s*系/);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= 19 ? (n as ZoneNumber) : null;
}

/**
 * 求積に使える座標か。
 *
 * CLAUDE.md「絶対に守る制約」6 のとおり、公図由来の座標を求積に使ってはならない。
 * 実データでは「図上測量」が紙の公図を数値化したものにあたる。
 * 「測量成果」であっても、最終的な求積は地積測量図の実測値で確定する。
 */
export function isUsableForArea(p: MojParcel): boolean {
  return p.coordKind === '測量成果';
}

/** 画面に出す注意書き。 */
export function precisionNote(p: MojParcel): string {
  if (p.coordKind === '測量成果') {
    return `座標値種別「測量成果」・精度区分「${p.precision}」。周辺の描画に使えます。求積は地積測量図の実測値で確定してください。`;
  }
  if (p.coordKind === '図上測量') {
    return `座標値種別「図上測量」。紙の図面を数値化したもので形状が歪んでいます。周辺の描画にのみ使い、**求積には使わないでください。**`;
  }
  return '座標値種別が不明です。求積には使わないでください。';
}

interface RawFeature {
  type?: unknown;
  properties?: Record<string, unknown>;
  geometry?: { type?: unknown; coordinates?: unknown };
}

function ringToLonLat(ring: unknown): LonLat[] | null {
  if (!Array.isArray(ring) || ring.length < 4) return null;
  const out: LonLat[] = [];
  for (const pt of ring) {
    if (!Array.isArray(pt) || pt.length < 2) return null;
    const [lon, lat] = pt;
    if (typeof lon !== 'number' || typeof lat !== 'number') return null;
    out.push({ lon, lat });
  }
  // GeoJSONのリングは始点と終点が同じ。閉じる分を落とす。
  if (out.length > 1) {
    const a = out[0];
    const b = out[out.length - 1];
    if (a.lon === b.lon && a.lat === b.lat) out.pop();
  }
  return out.length >= 3 ? out : null;
}

/**
 * GeoJSONを読み込む。
 * 壊れた地物は読み飛ばし、理由と件数を返す。黙って捨てない。
 */
export function loadMojGeoJson(json: unknown): MojLoadResult {
  const skipped = new Map<string, number>();
  const bump = (reason: string) => skipped.set(reason, (skipped.get(reason) ?? 0) + 1);

  // null や配列など、想定外の入力でも落とさない
  const root = (typeof json === 'object' && json !== null ? json : {}) as {
    name?: unknown;
    features?: unknown;
  };
  const name = typeof root.name === 'string' ? root.name : '';
  const features = Array.isArray(root.features) ? root.features : [];

  const parcels: MojParcel[] = [];
  for (const raw of features as RawFeature[]) {
    const props = raw.properties;
    if (!props) {
      bump('属性が無い');
      continue;
    }
    const g = raw.geometry;
    if (!g || g.type !== 'Polygon') {
      bump(`ポリゴンでない（${String(g?.type ?? 'なし')}）`);
      continue;
    }
    const rings = g.coordinates;
    if (!Array.isArray(rings) || rings.length === 0) {
      bump('座標が無い');
      continue;
    }
    const outline = ringToLonLat(rings[0]);
    if (!outline) {
      bump('外周を読めない');
      continue;
    }

    const chiban = String(props['地番'] ?? '').trim();
    if (chiban === '') {
      bump('地番が空');
      continue;
    }
    const oaza = String(props['大字名'] ?? '').trim();

    parcels.push({
      id: String(props['ID'] ?? ''),
      cityCode: String(props['市区町村C'] ?? ''),
      cityName: String(props['市区町村名'] ?? ''),
      oaza,
      chiban,
      label: oaza ? `${oaza}${chiban}` : chiban,
      precision: toPrecision(props['精度区分']),
      coordKind: toCoordKind(props['座標値種別']),
      mapName: String(props['地図名'] ?? ''),
      zone: parseZone(props['座標系']),
      datumKind: String(props['測地系判別'] ?? ''),
      outline,
    });
  }

  return {
    name,
    parcels,
    skipped: [...skipped].map(([reason, count]) => ({ reason, count })),
  };
}

/* ------------------------------------------------------- 位置による絞り込み */

/** 点が多角形の内側にあるか。交差数判定。 */
export function containsPoint(outline: readonly LonLat[], p: LonLat): boolean {
  let inside = false;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const a = outline[i];
    const b = outline[j];
    const straddles = a.lat > p.lat !== b.lat > p.lat;
    if (!straddles) continue;
    const x = ((b.lon - a.lon) * (p.lat - a.lat)) / (b.lat - a.lat) + a.lon;
    if (p.lon < x) inside = !inside;
  }
  return inside;
}

/** 経度緯度のおおよその重心。 */
export function roughCentroid(outline: readonly LonLat[]): LonLat {
  const n = outline.length;
  return {
    lon: outline.reduce((s, p) => s + p.lon, 0) / n,
    lat: outline.reduce((s, p) => s + p.lat, 0) / n,
  };
}

/** 2点間のおおよその距離[m]。絞り込みにしか使わないので簡易式でよい。 */
export function roughDistanceM(a: LonLat, b: LonLat): number {
  const latRad = ((a.lat + b.lat) / 2) * (Math.PI / 180);
  const dx = (b.lon - a.lon) * Math.cos(latRad) * 111_320;
  const dy = (b.lat - a.lat) * 111_320;
  return Math.hypot(dx, dy);
}

/** 指定した点を含む筆。複数重なっていれば先頭を返す。 */
export function parcelAt(parcels: readonly MojParcel[], p: LonLat): MojParcel | null {
  return parcels.find((q) => containsPoint(q.outline, p)) ?? null;
}

/** 指定した点から半径[m]以内に重心がある筆。近い順。 */
export function parcelsNear(parcels: readonly MojParcel[], p: LonLat, radiusM: number): MojParcel[] {
  return parcels
    .map((q) => ({ q, d: roughDistanceM(roughCentroid(q.outline), p) }))
    .filter((x) => x.d <= radiusM)
    .sort((a, b) => a.d - b.d)
    .map((x) => x.q);
}

/** 読み込んだデータの要約。画面と報告に出す。 */
export interface MojSummary {
  total: number;
  byCoordKind: Record<string, number>;
  byPrecision: Record<string, number>;
  zones: ZoneNumber[];
  cities: string[];
  usableForArea: number;
}

export function summarise(parcels: readonly MojParcel[]): MojSummary {
  const byCoordKind: Record<string, number> = {};
  const byPrecision: Record<string, number> = {};
  const zones = new Set<ZoneNumber>();
  const cities = new Set<string>();
  for (const p of parcels) {
    byCoordKind[p.coordKind] = (byCoordKind[p.coordKind] ?? 0) + 1;
    byPrecision[p.precision] = (byPrecision[p.precision] ?? 0) + 1;
    if (p.zone) zones.add(p.zone);
    if (p.cityName) cities.add(p.cityName);
  }
  return {
    total: parcels.length,
    byCoordKind,
    byPrecision,
    zones: [...zones].sort((a, b) => a - b),
    cities: [...cities],
    usableForArea: parcels.filter(isUsableForArea).length,
  };
}
