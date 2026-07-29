import { describe, it, expect } from 'vitest';
import { estimateZone, estimateZoneFromLonLat, prefectureOf } from './zone';

describe('都道府県の読み取り', () => {
  it('住所の先頭から都道府県を取り出す', () => {
    expect(prefectureOf('埼玉県鴻巣市')).toBe('埼玉県');
    expect(prefectureOf('東京都千代田区永田町1-7-1')).toBe('東京都');
    expect(prefectureOf('北海道札幌市中央区')).toBe('北海道');
    expect(prefectureOf('京都府京都市')).toBe('京都府');
  });

  it('都道府県が読めなければnull', () => {
    expect(prefectureOf('鴻巣市本町')).toBeNull();
    expect(prefectureOf('')).toBeNull();
  });
});

describe('系番号の推定', () => {
  it('単一の系に収まる都道府県は確定できる', () => {
    const e = estimateZone('埼玉県鴻巣市', { lon: 139.522232, lat: 36.065834 });
    expect(e.zone).toBe(9);
    expect(e.confidence).toBe('certain');
    expect(e.reason).toContain('埼玉県');
  });

  it.each([
    ['長崎県長崎市', 129.8, 32.75, 1],
    ['福岡県福岡市', 130.4, 33.59, 2],
    ['広島県広島市', 132.46, 34.39, 3],
    ['高知県高知市', 133.53, 33.56, 4],
    ['兵庫県神戸市', 135.19, 34.69, 5],
    ['大阪府大阪市', 135.52, 34.69, 6],
    ['愛知県名古屋市', 136.91, 35.18, 7],
    ['静岡県静岡市', 138.38, 34.98, 8],
    ['神奈川県横浜市', 139.64, 35.44, 9],
    ['宮城県仙台市', 140.87, 38.27, 10],
  ])('%s は第%d系', (address, lon, lat, zone) => {
    const e = estimateZone(address, { lon, lat });
    expect(e.zone).toBe(zone);
    expect(e.confidence).toBe('certain');
  });

  it('東京都の本土は確定、島嶼は近似', () => {
    expect(estimateZone('東京都千代田区', { lon: 139.69, lat: 35.69 })).toMatchObject({
      zone: 9,
      confidence: 'certain',
    });
    expect(estimateZone('東京都小笠原村父島', { lon: 142.19, lat: 27.09 })).toMatchObject({
      zone: 14,
      confidence: 'approximate',
    });
    expect(estimateZone('東京都小笠原村沖ノ鳥島', { lon: 136.08, lat: 20.42 }).zone).toBe(18);
    expect(estimateZone('東京都小笠原村南鳥島', { lon: 153.98, lat: 24.29 }).zone).toBe(19);
  });

  it('北海道は経度で近似し、確からしさをapproximateにする', () => {
    expect(estimateZone('北海道函館市', { lon: 140.73, lat: 41.77 }).zone).toBe(11);
    expect(estimateZone('北海道札幌市中央区', { lon: 141.35, lat: 43.06 }).zone).toBe(11);
    expect(estimateZone('北海道旭川市', { lon: 142.37, lat: 43.77 }).zone).toBe(12);
    expect(estimateZone('北海道稚内市', { lon: 141.67, lat: 45.42 }).zone).toBe(12);
    expect(estimateZone('北海道釧路市', { lon: 144.38, lat: 42.98 }).zone).toBe(13);
    expect(estimateZone('北海道根室市', { lon: 145.58, lat: 43.33 }).zone).toBe(13);

    for (const a of ['北海道函館市', '北海道旭川市', '北海道釧路市']) {
      expect(estimateZone(a, { lon: 142, lat: 43 }).confidence).toBe('approximate');
    }
  });

  it('北海道の日高地方は経度による近似では外れる。だからapproximateにしている', () => {
    // 浦河町は日高振興局＝第XI系だが、経度142.77は近似規則では第XII系になる。
    // 誤りを隠さず、確認を促す設計であることをテストで固定する。
    const e = estimateZone('北海道浦河町', { lon: 142.77, lat: 42.17 });
    expect(e.zone).toBe(12); // 近似の結果はこうなる
    expect(e.confidence).toBe('approximate');
  });

  it('沖縄県は3つの系に分かれる', () => {
    expect(estimateZone('沖縄県那覇市', { lon: 127.68, lat: 26.21 }).zone).toBe(15);
    expect(estimateZone('沖縄県石垣市', { lon: 124.16, lat: 24.34 }).zone).toBe(16);
    expect(estimateZone('沖縄県南大東村', { lon: 131.23, lat: 25.83 }).zone).toBe(17);
  });

  it('鹿児島県は本土と南西諸島で分かれる', () => {
    expect(estimateZone('鹿児島県鹿児島市', { lon: 130.56, lat: 31.6 }).zone).toBe(2);
    expect(estimateZone('鹿児島県西之表市', { lon: 130.99, lat: 30.73 }).zone).toBe(2);
    expect(estimateZone('鹿児島県奄美市', { lon: 129.49, lat: 28.38 }).zone).toBe(1);
  });

  it('住所が無ければ座標だけで推定し、必ずapproximateになる', () => {
    const e = estimateZone(null, { lon: 139.522232, lat: 36.065834 });
    expect(e.zone).toBe(9);
    expect(e.confidence).toBe('approximate');
    expect(e.reason).toContain('確認');
  });

  it('座標だけの推定でも主要都市は当たる', () => {
    expect(estimateZoneFromLonLat({ lon: 139.69, lat: 35.69 }).zone).toBe(9);
    expect(estimateZoneFromLonLat({ lon: 135.52, lat: 34.69 }).zone).toBe(6);
    expect(estimateZoneFromLonLat({ lon: 136.91, lat: 35.18 }).zone).toBe(7);
  });
});
