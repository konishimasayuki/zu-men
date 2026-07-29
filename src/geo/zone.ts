/**
 * 系番号の推定。
 *
 * **系を1つ間違えると座標が数十kmずれる。** 推定値をそのまま使わせない。
 * 本モジュールは推定と、その確からしさと、根拠を返すだけであり、
 * 確定は画面でユーザーに確認させること。
 *
 * 系の適用区域は測量法施行令第9条で「都道府県または市町村の区域」として
 * 定められている。都道府県が1つの系に収まる場合は都道府県名だけで確定できる。
 * 北海道・東京都・鹿児島県・沖縄県は複数の系にまたがるため、
 * 緯度経度による近似で絞り込み、確からしさを `approximate` として返す。
 */

import type { LonLat, ZoneNumber } from './crs';
import { ZONE_DEFINITIONS } from './crs';

export type ZoneConfidence = 'certain' | 'approximate';

export interface ZoneEstimate {
  zone: ZoneNumber;
  confidence: ZoneConfidence;
  /** 何を根拠に決めたか。画面にそのまま出す。 */
  reason: string;
}

/** 1つの系に収まる都道府県。ここに載っていれば都道府県名だけで確定する。 */
const SINGLE_ZONE_PREFECTURES: Readonly<Record<string, ZoneNumber>> = {
  長崎県: 1,
  福岡県: 2, 佐賀県: 2, 熊本県: 2, 大分県: 2, 宮崎県: 2,
  山口県: 3, 島根県: 3, 広島県: 3,
  香川県: 4, 愛媛県: 4, 徳島県: 4, 高知県: 4,
  兵庫県: 5, 鳥取県: 5, 岡山県: 5,
  京都府: 6, 大阪府: 6, 福井県: 6, 滋賀県: 6, 三重県: 6, 奈良県: 6, 和歌山県: 6,
  石川県: 7, 富山県: 7, 岐阜県: 7, 愛知県: 7,
  新潟県: 8, 長野県: 8, 山梨県: 8, 静岡県: 8,
  福島県: 9, 栃木県: 9, 茨城県: 9, 埼玉県: 9, 千葉県: 9, 群馬県: 9, 神奈川県: 9,
  青森県: 10, 秋田県: 10, 山形県: 10, 岩手県: 10, 宮城県: 10,
};

/** 複数の系にまたがる都道府県。 */
const MULTI_ZONE_PREFECTURES = ['北海道', '東京都', '鹿児島県', '沖縄県'] as const;

/** 住所文字列の先頭から都道府県名を取り出す。 */
export function prefectureOf(address: string): string | null {
  const t = address.trim();
  for (const p of MULTI_ZONE_PREFECTURES) if (t.startsWith(p)) return p;
  for (const p of Object.keys(SINGLE_ZONE_PREFECTURES)) if (t.startsWith(p)) return p;
  return null;
}

function estimateHokkaido(p: LonLat): ZoneEstimate {
  // 正式には振興局（支庁）単位。経度による近似なので必ず確認させる。
  // 日高振興局のように経度だけでは分けられない区域がある。
  if (p.lon >= 143.7) {
    return { zone: 13, confidence: 'approximate', reason: '北海道の東経143.7度以東（網走・根室・釧路）とみなしました' };
  }
  if (p.lon >= 141.5) {
    return { zone: 12, confidence: 'approximate', reason: '北海道の東経141.5〜143.7度（上川・留萌・宗谷・十勝）とみなしました' };
  }
  return { zone: 11, confidence: 'approximate', reason: '北海道の東経141.5度以西（石狩・空知・後志・胆振・渡島・檜山）とみなしました' };
}

function estimateTokyo(p: LonLat): ZoneEstimate {
  if (p.lon >= 150) return { zone: 19, confidence: 'approximate', reason: '南鳥島の周辺とみなしました' };
  if (p.lat < 22) return { zone: 18, confidence: 'approximate', reason: '沖ノ鳥島の周辺とみなしました' };
  if (p.lat < 30) return { zone: 14, confidence: 'approximate', reason: '小笠原諸島とみなしました' };
  return { zone: 9, confidence: 'certain', reason: '東京都の島嶼を除く区域です' };
}

function estimateKagoshima(p: LonLat): ZoneEstimate {
  // 第I系は北緯32度以南かつ東経130度以西の区域（トカラ列島・奄美群島）。
  if (p.lat < 32 && p.lon < 130) {
    return { zone: 1, confidence: 'approximate', reason: '鹿児島県のうち南西諸島（トカラ・奄美）とみなしました' };
  }
  return { zone: 2, confidence: 'approximate', reason: '鹿児島県の本土・種子島・屋久島とみなしました' };
}

function estimateOkinawa(p: LonLat): ZoneEstimate {
  if (p.lon < 125.5) return { zone: 16, confidence: 'approximate', reason: '沖縄県先島諸島（宮古・八重山）とみなしました' };
  if (p.lon > 130) return { zone: 17, confidence: 'approximate', reason: '沖縄県大東諸島とみなしました' };
  return { zone: 15, confidence: 'approximate', reason: '沖縄県本島周辺とみなしました' };
}

/**
 * 住所文字列と座標から系番号を推定する。
 * 住所から都道府県が読めない場合は座標だけで推定する。
 */
export function estimateZone(address: string | null, p: LonLat): ZoneEstimate {
  const pref = address ? prefectureOf(address) : null;

  if (pref) {
    const single = SINGLE_ZONE_PREFECTURES[pref];
    if (single !== undefined) {
      return { zone: single, confidence: 'certain', reason: `${pref}は第${ZONE_DEFINITIONS[single].roman}系の区域です` };
    }
    switch (pref) {
      case '北海道': return estimateHokkaido(p);
      case '東京都': return estimateTokyo(p);
      case '鹿児島県': return estimateKagoshima(p);
      case '沖縄県': return estimateOkinawa(p);
    }
  }

  return estimateZoneFromLonLat(p);
}

/**
 * 座標だけから系番号を推定する。住所が取れないときの保険。
 * 原点に最も近い系を選ぶだけなので、隣り合う系の境界付近では外れる。
 */
export function estimateZoneFromLonLat(p: LonLat): ZoneEstimate {
  let best: ZoneNumber = 9;
  let bestDist = Infinity;
  for (const d of Object.values(ZONE_DEFINITIONS)) {
    // 経度1度あたりの距離は緯度によって縮む。おおまかな重みを掛ける。
    const dLat = p.lat - d.originLat;
    const dLon = (p.lon - d.originLon) * Math.cos((p.lat * Math.PI) / 180);
    const dist = Math.hypot(dLat, dLon);
    if (dist < bestDist) {
      bestDist = dist;
      best = d.zone;
    }
  }
  return {
    zone: best,
    confidence: 'approximate',
    reason: '住所から都道府県を読み取れなかったため、原点が最も近い系を選びました。必ず確認してください',
  };
}
