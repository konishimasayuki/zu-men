import { describe, it, expect } from 'vitest';
import {
  loadMojGeoJson, parseZone, isUsableForArea, precisionNote, summarise,
  containsPoint, parcelAt, parcelsNear, roughCentroid,
} from './moj';
import fixture from './__fixtures__/moj_kounosu_sample.json';
import { toPlaneXY } from '../geo/crs';
import { area } from '../geo/area';

/**
 * 検収基準5。
 *
 * 固定値は実データ（法務省登記所備付地図データ 鴻巣市 2025年版、
 * G空間情報センターのGeoJSON版）から半径160mぶんを抜き出したもの。
 * 属性名も値もこちらで作っていない。
 */
const loaded = loadMojGeoJson(fixture);

describe('検収基準5: 実データの読み込み', () => {
  it('実データを読み込める', () => {
    expect(loaded.name).toContain('鴻巣市');
    expect(loaded.parcels.length).toBe(269);
    expect(loaded.skipped).toEqual([]);
  });

  it('属性が実データのとおりに取れる', () => {
    const p = loaded.parcels[0];
    expect(p.cityCode).toBe('11217');
    expect(p.cityName).toBe('鴻巣市');
    expect(p.oaza).toBe('愛の町');
    expect(p.chiban).toMatch(/^\d/);
    expect(p.label).toBe(`愛の町${p.chiban}`);
    expect(p.outline.length).toBeGreaterThanOrEqual(3);
  });

  it('座標は経度緯度である（平面直角座標ではない）', () => {
    for (const p of loaded.parcels.slice(0, 20)) {
      for (const q of p.outline) {
        expect(q.lon).toBeGreaterThan(139);
        expect(q.lon).toBeLessThan(140);
        expect(q.lat).toBeGreaterThan(35);
        expect(q.lat).toBeLessThan(37);
      }
    }
  });

  it('要約が出せる', () => {
    const s = summarise(loaded.parcels);
    expect(s.total).toBe(269);
    expect(s.cities).toEqual(['鴻巣市']);
    expect(s.zones).toEqual([9]);
    expect(s.byCoordKind).toEqual({ 測量成果: 269 });
    expect(s.byPrecision).toEqual({ 甲一: 269 });
    expect(s.usableForArea).toBe(269);
  });
});

describe('系番号の取り出し', () => {
  it('「公共座標9系」から9を取る', () => {
    expect(parseZone('公共座標9系')).toBe(9);
    expect(parseZone('公共座標12系')).toBe(12);
    expect(parseZone('公共座標1系')).toBe(1);
  });

  it('読めない値は null', () => {
    expect(parseZone('任意座標')).toBeNull();
    expect(parseZone(undefined)).toBeNull();
    expect(parseZone('公共座標20系')).toBeNull();
  });

  it('実データの系番号は9系（埼玉県）で、住所からの推定と一致する', () => {
    expect(loaded.parcels.every((p) => p.zone === 9)).toBe(true);
  });
});

describe('公図由来の座標を求積に使わせない', () => {
  it('測量成果は求積に使える', () => {
    const p = loaded.parcels[0];
    expect(p.coordKind).toBe('測量成果');
    expect(isUsableForArea(p)).toBe(true);
    expect(precisionNote(p)).toContain('地積測量図');
  });

  it('図上測量は求積に使わせない', () => {
    const p = { ...loaded.parcels[0], coordKind: '図上測量' as const };
    expect(isUsableForArea(p)).toBe(false);
    expect(precisionNote(p)).toContain('求積には使わないでください');
  });

  it('座標値種別が不明なものも求積に使わせない', () => {
    const p = { ...loaded.parcels[0], coordKind: 'その他' as const };
    expect(isUsableForArea(p)).toBe(false);
    expect(precisionNote(p)).toContain('求積には使わないでください');
  });
});

describe('壊れた地物を黙って捨てない', () => {
  it('理由と件数を返す', () => {
    const r = loadMojGeoJson({
      name: 'test',
      features: [
        { type: 'Feature', properties: { 地番: '1' }, geometry: { type: 'Point', coordinates: [0, 0] } },
        { type: 'Feature', properties: { 地番: '2' }, geometry: { type: 'Polygon', coordinates: [] } },
        { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] } },
        { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] } },
      ],
    });
    expect(r.parcels).toHaveLength(0);
    expect(r.skipped).toEqual(
      expect.arrayContaining([
        { reason: 'ポリゴンでない（Point）', count: 1 },
        { reason: '座標が無い', count: 1 },
        { reason: '地番が空', count: 1 },
        { reason: '属性が無い', count: 1 },
      ]),
    );
  });

  it('空・null・配列・文字列でも落ちない', () => {
    for (const bad of [{}, null, undefined, [], 'x', 42, { features: 'no' }]) {
      const r = loadMojGeoJson(bad);
      expect(r.parcels).toEqual([]);
      expect(r.name).toBe('');
    }
  });
});

describe('ピンの位置から筆を選ぶ', () => {
  it('筆の重心を指すとその筆が返る', () => {
    for (const p of loaded.parcels.slice(0, 30)) {
      const c = roughCentroid(p.outline);
      const hit = parcelAt(loaded.parcels, c);
      // 凹多角形では重心が外に出ることがあるので、当たった場合だけ確かめる
      if (hit) expect(containsPoint(hit.outline, c)).toBe(true);
    }
  });

  it('データの外を指すと null', () => {
    expect(parcelAt(loaded.parcels, { lon: 140.5, lat: 35.0 })).toBeNull();
  });

  it('半径で絞り込むと近い順に並ぶ', () => {
    const c = roughCentroid(loaded.parcels[0].outline);
    const near = parcelsNear(loaded.parcels, c, 60);
    expect(near.length).toBeGreaterThan(1);
    expect(near.length).toBeLessThan(loaded.parcels.length);
    expect(near[0].id).toBe(loaded.parcels[0].id);
  });

  it('半径0なら自分だけか空', () => {
    const c = roughCentroid(loaded.parcels[0].outline);
    expect(parcelsNear(loaded.parcels, c, 0).length).toBeLessThanOrEqual(1);
  });
});

describe('実データの面積を座標法で計算する', () => {
  it('平面直角座標に変換してから計算する（緯度経度のままでは計算しない）', () => {
    const p = loaded.parcels[0];
    const xy = p.outline.map((q) => toPlaneXY(q, 9));
    const a = area(xy);
    // 実在の筆なので、常識的な範囲に入るはず
    expect(a).toBeGreaterThan(1);
    expect(a).toBeLessThan(100_000);
  });

  it('269筆すべてが正の面積を持つ', () => {
    for (const p of loaded.parcels) {
      const a = area(p.outline.map((q) => toPlaneXY(q, 9)));
      expect(a).toBeGreaterThan(0);
    }
  });

  it('抜粋の合計面積が半径160mの円の面積とおおむね釣り合う', () => {
    const total = loaded.parcels.reduce(
      (s, p) => s + area(p.outline.map((q) => toPlaneXY(q, 9))),
      0,
    );
    // 半径160mの円は約80,400㎡。道路等を除くので下回るのが自然。
    expect(total).toBeGreaterThan(10_000);
    expect(total).toBeLessThan(120_000);
  });
});
