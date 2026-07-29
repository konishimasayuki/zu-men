/**
 * 国土地理院のサービス。
 *
 * 住所検索APIはAPIキー不要・無償。地理院地図自身が使っている公開エンドポイント。
 * Googleマップ・Google Geocoding APIは使わない（CLAUDE.md「やらないこと」）。
 *
 * 地理院タイルは**画面編集の下敷き専用**であり、PDFには焼き込まない。
 * 画面表示にあたっては出典表示が必要なので、地図には必ず帰属表示を付ける。
 */

import type { LonLat } from '../geo/crs';

const ADDRESS_SEARCH_URL = 'https://msearch.gsi.go.jp/address-search/AddressSearch';

/** 地理院タイル。画面表示のみ。 */
export const GSI_TILES = {
  pale: {
    label: '淡色地図',
    url: 'https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png',
    maxZoom: 18,
  },
  std: {
    label: '標準地図',
    url: 'https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png',
    maxZoom: 18,
  },
  photo: {
    label: '航空写真',
    url: 'https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg',
    maxZoom: 18,
  },
} as const;

export type GsiTileKey = keyof typeof GSI_TILES;

/** 地理院タイルの出典表示。画面に必ず出す。 */
export const GSI_ATTRIBUTION =
  '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noreferrer">国土地理院</a>';

export interface AddressHit {
  /** 「埼玉県鴻巣市」のような住所文字列。 */
  title: string;
  position: LonLat;
}

interface RawFeature {
  geometry?: { coordinates?: unknown };
  properties?: { title?: unknown };
}

function parseHit(f: RawFeature): AddressHit | null {
  const coords = f.geometry?.coordinates;
  const title = f.properties?.title;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const [lon, lat] = coords;
  if (typeof lon !== 'number' || typeof lat !== 'number') return null;
  if (typeof title !== 'string' || title === '') return null;
  return { title, position: { lon, lat } };
}

/**
 * 住所を検索する。該当が無ければ空配列。
 * 応答の並び順は地理院側の判断によるもので、先頭が最も一致度が高い。
 */
export async function searchAddress(query: string, signal?: AbortSignal): Promise<AddressHit[]> {
  const q = query.trim();
  if (q === '') return [];

  const res = await fetch(`${ADDRESS_SEARCH_URL}?q=${encodeURIComponent(q)}`, { signal });
  if (!res.ok) throw new Error(`住所検索に失敗しました（HTTP ${res.status}）`);

  const body: unknown = await res.json();
  if (!Array.isArray(body)) return [];
  return body.map((f) => parseHit(f as RawFeature)).filter((h): h is AddressHit => h !== null);
}
