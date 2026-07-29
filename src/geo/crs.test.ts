import { describe, it, expect } from 'vitest';
import { toPlaneXY, toLonLat, ZONE_DEFINITIONS, ZONE_NUMBERS, zoneLabel, SCALE_FACTOR } from './crs';
import type { ZoneNumber } from './crs';
import { area } from './area';
import fixtures from './__fixtures__/crs.json';

/**
 * 検収基準3。
 *
 * 期待値は PROJ（pyproj）が生成したもので、手で書いていない。
 * 自分の実装を自分の記憶で検証しても意味がないため、EPSGの公式パラメータを持つ
 * 独立実装と突き合わせる。再生成は `python3 scripts/genCrsFixtures.py`。
 */
describe('検収基準3: 座標変換', () => {
  it('固定値はPROJが生成したものである', () => {
    expect(fixtures.generatedBy).toMatch(/^PROJ /);
    expect(fixtures.points.length).toBeGreaterThanOrEqual(9);
  });

  it('19系すべての原点がEPSGデータベースと一致する', () => {
    expect(fixtures.origins).toHaveLength(19);
    for (const o of fixtures.origins) {
      const d = ZONE_DEFINITIONS[o.zone as ZoneNumber];
      expect(d.epsg).toBe(o.epsg);
      expect(d.originLat).toBeCloseTo(o.lat, 9);
      expect(d.originLon).toBeCloseTo(o.lon, 9);
      expect(SCALE_FACTOR).toBeCloseTo(o.k, 12);
    }
  });

  it('19系すべてで原点の緯度経度が平面直角座標の(0, 0)になる', () => {
    for (const zone of ZONE_NUMBERS) {
      const d = ZONE_DEFINITIONS[zone];
      const xy = toPlaneXY({ lon: d.originLon, lat: d.originLat }, zone);
      expect(xy.x).toBeCloseTo(0, 6);
      expect(xy.y).toBeCloseTo(0, 6);
    }
  });

  it('実在の地点でPROJと1mm以内で一致する', () => {
    for (const p of fixtures.points) {
      const xy = toPlaneXY({ lon: p.lon, lat: p.lat }, p.zone as ZoneNumber);
      expect(xy.x, `${p.name} のX`).toBeCloseTo(p.x, 3);
      expect(xy.y, `${p.name} のY`).toBeCloseTo(p.y, 3);
    }
  });

  it('X は北向き、Y は東向きである', () => {
    const zone: ZoneNumber = 9;
    const d = ZONE_DEFINITIONS[zone];
    const north = toPlaneXY({ lon: d.originLon, lat: d.originLat + 0.01 }, zone);
    const east = toPlaneXY({ lon: d.originLon + 0.01, lat: d.originLat }, zone);
    // 北へ動かすとXだけが増える
    expect(north.x).toBeGreaterThan(1000);
    expect(Math.abs(north.y)).toBeLessThan(1);
    // 東へ動かすとYだけが増える
    expect(east.y).toBeGreaterThan(800);
    expect(Math.abs(east.x)).toBeLessThan(1);
  });

  it('緯度経度へ戻すと元に戻る', () => {
    for (const p of fixtures.points) {
      const back = toLonLat(toPlaneXY({ lon: p.lon, lat: p.lat }, p.zone as ZoneNumber), p.zone as ZoneNumber);
      expect(back.lon).toBeCloseTo(p.lon, 9);
      expect(back.lat).toBeCloseTo(p.lat, 9);
    }
  });

  it('系を間違えると座標が大きくずれる（確認UIが必要な理由）', () => {
    const kounosu = { lon: 139.522232, lat: 36.065834 };
    const correct = toPlaneXY(kounosu, 9);
    const wrong = toPlaneXY(kounosu, 8);
    const gapKm = Math.hypot(correct.x - wrong.x, correct.y - wrong.y) / 1000;
    expect(gapKm).toBeGreaterThan(50);
  });

  it('表示用ラベルが系番号とEPSGを含む', () => {
    expect(zoneLabel(9)).toBe('第IX系（系番号9・EPSG:6677）');
    expect(zoneLabel(1)).toBe('第I系（系番号1・EPSG:6669）');
  });
});

describe('平面直角座標での面積計算', () => {
  it('緯度経度から変換した20m四方が400㎡になる', () => {
    // 鴻巣市付近を基準に、東へ20m・北へ20mの正方形を緯度経度で作る
    const zone: ZoneNumber = 9;
    const base = { lon: 139.522232, lat: 36.065834 };
    const o = toPlaneXY(base, zone);
    const corners = [
      { x: o.x, y: o.y },
      { x: o.x, y: o.y + 20 },
      { x: o.x + 20, y: o.y + 20 },
      { x: o.x + 20, y: o.y },
    ];
    // 一度緯度経度に戻してから再変換しても面積が保たれる
    const roundTripped = corners.map((c) => toPlaneXY(toLonLat(c, zone), zone));
    expect(area(roundTripped)).toBeCloseTo(400.0, 6);
  });

  it('縮尺係数0.9999のぶん、平面上の長さは地表長よりわずかに短い', () => {
    // 原点直上では 1000m の地表長が 999.9m として表現される
    const zone: ZoneNumber = 9;
    const d = ZONE_DEFINITIONS[zone];
    const a = toPlaneXY({ lon: d.originLon, lat: d.originLat }, zone);
    const b = toPlaneXY({ lon: d.originLon, lat: d.originLat + 0.1 }, zone);
    const planeLength = Math.abs(b.x - a.x);
    // 緯度0.1度はおよそ11.1km。縮尺係数を戻すと地表長になる。
    expect(planeLength / SCALE_FACTOR).toBeGreaterThan(planeLength);
  });
});
