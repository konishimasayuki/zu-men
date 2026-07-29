import { describe, expect, it } from 'vitest';
import {
  convexHull,
  distanceToBoundary,
  labelSpot,
  layoutParking,
  minimumAreaRectangle,
  pointInPolygon,
} from './layout';
import type { PlaneXY } from '../paper/transform';
import { area as polygonArea } from '../geo/area';
import { PARKING_STANDARDS } from './standards';
import { loadMojGeoJson } from '../data/moj';
import { toPlaneXY } from '../geo/crs';
import sample from '../data/__fixtures__/moj_kounosu_sample.json';

/** X=北・Y=東。反時計回りの矩形を作る。 */
function rect(northM: number, eastM: number, originX = 0, originY = 0): PlaneXY[] {
  return [
    { x: originX, y: originY },
    { x: originX, y: originY + eastM },
    { x: originX + northM, y: originY + eastM },
    { x: originX + northM, y: originY },
  ];
}

/** 局所座標(u,v)で表した矩形を、方位角 bearing だけ回して置く。 */
function rotatedRect(lengthM: number, widthM: number, bearingDeg: number): PlaneXY[] {
  const r = (bearingDeg * Math.PI) / 180;
  const along = { x: Math.cos(r), y: Math.sin(r) };
  const perp = { x: -Math.sin(r), y: Math.cos(r) };
  const half = [
    [-lengthM / 2, -widthM / 2],
    [lengthM / 2, -widthM / 2],
    [lengthM / 2, widthM / 2],
    [-lengthM / 2, widthM / 2],
  ];
  return half.map(([u, v]) => ({
    x: along.x * u + perp.x * v,
    y: along.y * u + perp.y * v,
  }));
}

describe('convexHull', () => {
  it('内側の点を落とす', () => {
    const pts = [...rect(10, 10), { x: 5, y: 5 }, { x: 2, y: 8 }];
    expect(convexHull(pts)).toHaveLength(4);
  });

  it('点が2つ以下ならそのまま返す', () => {
    expect(convexHull([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toHaveLength(2);
  });
});

describe('pointInPolygon', () => {
  const square = rect(10, 10);

  it('内側の点', () => {
    expect(pointInPolygon(square, { x: 5, y: 5 })).toBe(true);
  });

  it('外側の点', () => {
    expect(pointInPolygon(square, { x: 15, y: 5 })).toBe(false);
    expect(pointInPolygon(square, { x: 5, y: -1 })).toBe(false);
  });

  it('L字の欠けた部分は外側', () => {
    // 20×20の左上を10×10だけ欠いたL字
    const l: PlaneXY[] = [
      { x: 0, y: 0 },
      { x: 0, y: 20 },
      { x: 10, y: 20 },
      { x: 10, y: 10 },
      { x: 20, y: 10 },
      { x: 20, y: 0 },
    ];
    expect(pointInPolygon(l, { x: 5, y: 5 })).toBe(true);
    expect(pointInPolygon(l, { x: 15, y: 15 })).toBe(false);
  });
});

describe('distanceToBoundary', () => {
  it('中心からは辺までの距離', () => {
    expect(distanceToBoundary(rect(10, 20), { x: 5, y: 10 })).toBeCloseTo(5, 9);
  });

  it('隅の近くでは隅までの距離', () => {
    expect(distanceToBoundary(rect(10, 10), { x: 3, y: 4 })).toBeCloseTo(3, 9);
  });
});

describe('minimumAreaRectangle', () => {
  it('軸に沿った矩形の寸法と向きを返す', () => {
    // 東西に30m、南北に10m。長手は東向き＝方位角90度。
    const box = minimumAreaRectangle(rect(10, 30));
    expect(box.lengthM).toBeCloseTo(30, 6);
    expect(box.widthM).toBeCloseTo(10, 6);
    expect(box.bearingDeg).toBeCloseTo(90, 6);
    expect(box.center.x).toBeCloseTo(5, 6);
    expect(box.center.y).toBeCloseTo(15, 6);
  });

  it('斜めの矩形でも向きを当てる', () => {
    for (const bearing of [0, 20, 37, 90, 123, 170]) {
      const box = minimumAreaRectangle(rotatedRect(24, 9, bearing));
      expect(box.lengthM).toBeCloseTo(24, 6);
      expect(box.widthM).toBeCloseTo(9, 6);
      expect(box.bearingDeg).toBeCloseTo(bearing % 180, 4);
    }
  });

  it('外接矩形の面積は敷地の面積以上', () => {
    const l: PlaneXY[] = [
      { x: 0, y: 0 },
      { x: 0, y: 20 },
      { x: 10, y: 20 },
      { x: 10, y: 10 },
      { x: 20, y: 10 },
      { x: 20, y: 0 },
    ];
    const box = minimumAreaRectangle(l);
    expect(box.lengthM * box.widthM).toBeGreaterThanOrEqual(polygonArea(l) - 1e-9);
  });

  it('点が足りなければ0を返す', () => {
    expect(minimumAreaRectangle([{ x: 1, y: 2 }]).lengthM).toBe(0);
  });
});

describe('layoutParking', () => {
  const { stall, aisle } = PARKING_STANDARDS;

  it('マスがすべて敷地の内側に入る', () => {
    const site = rect(40, 60);
    const layout = layoutParking(site);
    expect(layout.count).toBeGreaterThan(0);
    for (const band of layout.bands) {
      for (const s of band.stalls) {
        expect(pointInPolygon(site, s.center)).toBe(true);
        // マスの外接円の半径ぶん見ておけば、隅も内側にある
        expect(distanceToBoundary(site, s.center)).toBeGreaterThan(stall.widthM / 2);
      }
    }
  });

  it('L字の欠けた側にはマスを置かない', () => {
    const l: PlaneXY[] = [
      { x: 0, y: 0 },
      { x: 0, y: 60 },
      { x: 25, y: 60 },
      { x: 25, y: 30 },
      { x: 50, y: 30 },
      { x: 50, y: 0 },
    ];
    const layout = layoutParking(l);
    expect(layout.count).toBeGreaterThan(0);
    for (const band of layout.bands) {
      for (const s of band.stalls) {
        expect(pointInPolygon(l, s.center)).toBe(true);
      }
    }
    // 欠けている領域（北東側）にマスが1台も無い
    const inNotch = layout.bands
      .flatMap((b) => b.stalls)
      .filter((s) => s.center.x > 25 && s.center.y > 30);
    expect(inNotch).toHaveLength(0);
  });

  it('車路をはさんだ2列は向かい合う', () => {
    const layout = layoutParking(rect(30, 50), { bearingDeg: 90 });
    expect(layout.bands.length).toBeGreaterThanOrEqual(2);
    const a = layout.bands[0].stalls[0].bearingDeg;
    const b = layout.bands[1].stalls[0].bearingDeg;
    expect(Math.abs(a - b)).toBeCloseTo(180, 6);
  });

  it('車路が入らない敷地には1台も置かない', () => {
    // 奥行がマス1台ぶんしかない＝車路が取れない
    const layout = layoutParking(rect(6, 40));
    expect(layout.count).toBe(0);
    expect(layout.bands).toHaveLength(0);
  });

  it('狭すぎる敷地では0台', () => {
    expect(layoutParking(rect(2, 2)).count).toBe(0);
  });

  it('区画の帯は台数ぶんの幅を持つ', () => {
    const layout = layoutParking(rect(30, 50), { bearingDeg: 90 });
    for (const band of layout.bands) {
      const w = Math.hypot(
        band.outline[1].x - band.outline[0].x,
        band.outline[1].y - band.outline[0].y,
      );
      expect(w).toBeCloseTo(band.stalls.length * stall.widthM, 6);
      const d = Math.hypot(
        band.outline[2].x - band.outline[1].x,
        band.outline[2].y - band.outline[1].y,
      );
      expect(d).toBeCloseTo(stall.depthM, 6);
    }
  });

  it('敷地面積を返す', () => {
    expect(layoutParking(rect(20, 20)).siteAreaM2).toBeCloseTo(400, 6);
  });

  it('区画寸法を変えられる', () => {
    const site = rect(40, 60);
    const wide = layoutParking(site, { stallWidthM: 3.0 });
    const narrow = layoutParking(site, { stallWidthM: 2.3 });
    expect(narrow.count).toBeGreaterThan(wide.count);
  });

  it('一方通行にすると車路が3.5mになり、狭い敷地でも入る', () => {
    // 11m角＝121㎡。余白1.0を引いた10mに対し、対面は 帯5+車路5.5=10.5 で入らない。
    // 一方通行なら 帯5+車路3.5=8.5 で入る。どちらの向きに回しても同じなので逃げ場がない。
    const site = rect(11, 11);
    const twoWay = layoutParking(site);
    const oneWay = layoutParking(site, { oneWay: true });
    expect(twoWay.aisleM).toBe(aisle.twoWayMinM);
    expect(oneWay.aisleM).toBe(aisle.oneWayMinM);
    expect(twoWay.count).toBe(0);
    expect(oneWay.count).toBeGreaterThan(0);
  });

  it('車路幅を直接指定すると一方通行の指定より優先される', () => {
    const l = layoutParking(rect(40, 60), { oneWay: true, aisleM: 6.0 });
    expect(l.aisleM).toBe(6.0);
  });

  it('斜めの敷地でも敷地の向きに沿って並ぶ', () => {
    const bearing = 33;
    const layout = layoutParking(rotatedRect(50, 30, bearing));
    expect(layout.count).toBeGreaterThan(0);
    // 割り付けの向きは敷地の長手か、それに直交する向きのどちらか
    const d = Math.min(
      Math.abs(layout.bearingDeg - bearing),
      Math.abs(layout.bearingDeg - ((bearing + 90) % 180)),
    );
    expect(d).toBeLessThan(1e-3);
    // 車はその向きに直交する（＝車路を向く）
    for (const s of layout.bands[0].stalls) {
      const rel = ((s.bearingDeg - layout.bearingDeg) % 180 + 180) % 180;
      expect(rel).toBeCloseTo(90, 6);
    }
  });

  it('車路の注記位置は帯と帯のあいだにある', () => {
    const layout = layoutParking(rect(30, 50), { bearingDeg: 90 });
    expect(layout.aisleCenters.length).toBeGreaterThan(0);
    for (const c of layout.aisleCenters) {
      // 車路の中心はどのマスからも「マス奥行の半分＋車路の半分」離れている
      for (const band of layout.bands) {
        for (const s of band.stalls) {
          const dist = Math.hypot(c.x - s.center.x, c.y - s.center.y);
          expect(dist).toBeGreaterThan(aisle.twoWayMinM / 2 - 1e-6);
        }
      }
    }
  });

  it('90坪・143坪の敷地に現実的な台数が入る', () => {
    // 90坪＝297.5㎡ を正方形とみなすと一辺17.2m
    const small = layoutParking(rect(17.25, 17.25));
    // 143坪＝472.7㎡ の一辺は21.7m
    const large = layoutParking(rect(21.74, 21.74));
    expect(small.count).toBeGreaterThan(0);
    expect(large.count).toBeGreaterThanOrEqual(small.count);
    // 1台あたりの敷地面積が15㎡を下回ることはない（マス12.5㎡＋車路）
    expect(small.siteAreaM2 / small.count).toBeGreaterThan(15);
    expect(large.siteAreaM2 / large.count).toBeGreaterThan(15);
  });
});

describe('labelSpot', () => {
  it('障害物が無ければ中央に近いところ', () => {
    const p = labelSpot(rect(20, 20));
    expect(p.x).toBeCloseTo(10, 1);
    expect(p.y).toBeCloseTo(10, 1);
  });

  it('必ず多角形の内側', () => {
    const l: PlaneXY[] = [
      { x: 0, y: 0 },
      { x: 0, y: 20 },
      { x: 10, y: 20 },
      { x: 10, y: 10 },
      { x: 20, y: 10 },
      { x: 20, y: 0 },
    ];
    expect(pointInPolygon(l, labelSpot(l))).toBe(true);
  });

  it('障害物の上には置かない', () => {
    const site = rect(40, 40);
    // 敷地の中央に大きな区画がある
    const band = rect(20, 20, 10, 10);
    const p = labelSpot(site, [band]);
    expect(pointInPolygon(site, p)).toBe(true);
    expect(pointInPolygon(band, p)).toBe(false);
    // 区画からも敷地の縁からも離れている
    expect(distanceToBoundary(band, p)).toBeGreaterThan(1);
    expect(distanceToBoundary(site, p)).toBeGreaterThan(1);
  });

  it('割り付けた区画を避ける', () => {
    const site = rect(40, 60);
    const layout = layoutParking(site);
    const p = labelSpot(site, layout.bands.map((b) => b.outline));
    for (const b of layout.bands) {
      expect(pointInPolygon(b.outline, p)).toBe(false);
    }
  });
});

describe('実データの筆への割り付け', () => {
  const { parcels } = loadMojGeoJson(sample);

  it('鴻巣市の実際の筆で、はみ出すマスが出ない', () => {
    let tried = 0;
    let withStalls = 0;
    for (const p of parcels.slice(0, 60)) {
      const outline = p.outline.map((q) => toPlaneXY(q, 9));
      const layout = layoutParking(outline);
      tried++;
      if (layout.count > 0) withStalls++;
      for (const band of layout.bands) {
        for (const s of band.stalls) {
          expect(pointInPolygon(outline, s.center)).toBe(true);
        }
      }
      // 台数×1台分の面積が敷地面積を超えることはない
      const stallArea = layout.count * PARKING_STANDARDS.stall.widthM * PARKING_STANDARDS.stall.depthM;
      expect(stallArea).toBeLessThanOrEqual(layout.siteAreaM2 + 1e-6);
    }
    expect(tried).toBe(60);
    // 全部が0台ということは無い（実データに十分な広さの筆がある）
    expect(withStalls).toBeGreaterThan(0);
  });
});
