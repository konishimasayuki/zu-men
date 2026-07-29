import { describe, expect, it } from 'vitest';
import {
  boundaryEdges,
  defaultEntranceEdge,
  planDrainage,
  planEntrance,
  DEFAULT_ENTRANCE_WIDTH_M,
} from './site';
import { pointInPolygon, distanceToBoundary, layoutParking } from './layout';
import type { PlaneXY } from '../paper/transform';
import { loadMojGeoJson } from '../data/moj';
import { toPlaneXY } from '../geo/crs';
import sample from '../data/__fixtures__/moj_kounosu_sample.json';

/** X=北・Y=東。反時計回りの矩形。 */
function rect(northM: number, eastM: number, originX = 0, originY = 0): PlaneXY[] {
  return [
    { x: originX, y: originY },
    { x: originX, y: originY + eastM },
    { x: originX + northM, y: originY + eastM },
    { x: originX + northM, y: originY },
  ];
}

/** 時計回りの矩形。回り方が逆でも外向きが正しいことを確かめるため。 */
function rectCW(northM: number, eastM: number): PlaneXY[] {
  return [...rect(northM, eastM)].reverse();
}

describe('boundaryEdges', () => {
  it('辺の数と長さ', () => {
    const edges = boundaryEdges(rect(20, 30));
    expect(edges).toHaveLength(4);
    const lens = edges.map((e) => e.lengthM).sort((a, b) => a - b);
    expect(lens).toEqual([20, 20, 30, 30]);
  });

  it('法線は必ず敷地の外を向く（反時計回り）', () => {
    const site = rect(20, 30);
    for (const e of boundaryEdges(site)) {
      const out = { x: e.mid.x + e.outward.x * 0.5, y: e.mid.y + e.outward.y * 0.5 };
      const inn = { x: e.mid.x - e.outward.x * 0.5, y: e.mid.y - e.outward.y * 0.5 };
      expect(pointInPolygon(site, out)).toBe(false);
      expect(pointInPolygon(site, inn)).toBe(true);
    }
  });

  it('回り方が逆でも外を向く', () => {
    const site = rectCW(20, 30);
    for (const e of boundaryEdges(site)) {
      const out = { x: e.mid.x + e.outward.x * 0.5, y: e.mid.y + e.outward.y * 0.5 };
      expect(pointInPolygon(site, out)).toBe(false);
    }
  });

  it('法線は単位ベクトル', () => {
    for (const e of boundaryEdges(rect(17, 23))) {
      expect(Math.hypot(e.outward.x, e.outward.y)).toBeCloseTo(1, 12);
    }
  });

  it('外側の隣接筆の地番が分かる', () => {
    const site = rect(20, 20);
    // 東側(y=20より外)に隣接筆を置く
    const east = { chiban: '99', outline: rect(20, 10, 0, 20) };
    const edges = boundaryEdges(site, [east]);
    const withNeighbour = edges.filter((e) => e.neighbourChiban === '99');
    expect(withNeighbour).toHaveLength(1);
    expect(withNeighbour[0].mid.y).toBeCloseTo(20, 6);
    // 残りの辺は隣接筆が無い
    expect(edges.filter((e) => e.neighbourChiban === null)).toHaveLength(3);
  });

  it('既定の進入口はいちばん長い辺', () => {
    const edges = boundaryEdges(rect(10, 40));
    expect(defaultEntranceEdge(edges)!.lengthM).toBeCloseTo(40, 6);
  });
});

describe('planEntrance', () => {
  const site = rect(20, 40);
  const edges = boundaryEdges(site);
  const edge = defaultEntranceEdge(edges)!;

  it('開口の幅は既定値', () => {
    const plan = planEntrance(site, edge);
    const [p0, p1] = plan.opening;
    expect(Math.hypot(p1.x - p0.x, p1.y - p0.y)).toBeCloseTo(DEFAULT_ENTRANCE_WIDTH_M, 9);
    expect(plan.widthM).toBeCloseTo(DEFAULT_ENTRANCE_WIDTH_M, 9);
  });

  it('フェンスが進入口を横切らない', () => {
    const plan = planEntrance(site, edge);
    const mid = plan.center;
    for (const path of plan.fencePaths) {
      for (let i = 0; i + 1 < path.length; i++) {
        // 開口の中心が線分の上に乗っていないこと
        expect(distanceToSegment(mid, path[i], path[i + 1])).toBeGreaterThan(
          DEFAULT_ENTRANCE_WIDTH_M / 2 - 1e-6,
        );
      }
    }
  });

  it('フェンスは外周をひとつながりに回る（開口ぶんだけ短い）', () => {
    const plan = planEntrance(site, edge);
    const total = plan.fencePaths.reduce((s, path) => {
      let d = 0;
      for (let i = 0; i + 1 < path.length; i++) {
        d += Math.hypot(path[i + 1].x - path[i].x, path[i + 1].y - path[i].y);
      }
      return s + d;
    }, 0);
    const perimeter = 2 * (20 + 40);
    expect(total).toBeCloseTo(perimeter - DEFAULT_ENTRANCE_WIDTH_M, 6);
  });

  it('隅切りは敷地の内側へ折る（外に描かない）', () => {
    const plan = planEntrance(site, edge);
    expect(plan.cornerCuts).toHaveLength(2);
    for (const [, tip] of plan.cornerCuts) {
      expect(pointInPolygon(site, tip)).toBe(true);
    }
  });

  it('隅切りを0にすると描かない', () => {
    expect(planEntrance(site, edge, { cornerCutM: 0 }).cornerCuts).toHaveLength(0);
  });

  it('開口は辺より広くならない', () => {
    const shortEdge = boundaryEdges(rect(6, 40)).find((e) => e.lengthM === 6)!;
    const plan = planEntrance(rect(6, 40), shortEdge, { widthM: 20 });
    expect(plan.widthM).toBeLessThanOrEqual(6);
  });
});

describe('planDrainage', () => {
  const site = rect(30, 50);
  const edges = boundaryEdges(site);
  const edge = defaultEntranceEdge(edges)!;
  const bands = layoutParking(site).bands;

  it('側溝と集水桝は敷地の内側にある', () => {
    const plan = planDrainage(bands, edge);
    for (const p of plan.gutter!.path) expect(pointInPolygon(site, p)).toBe(true);
    for (const b of plan.basins) {
      expect(pointInPolygon(site, b)).toBe(true);
      // 記号が境界線をまたがない程度に離れている
      expect(distanceToBoundary(site, b)).toBeGreaterThan(0.9);
    }
  });

  it('側溝は放流先の辺に沿う', () => {
    const plan = planDrainage(bands, edge);
    const [a, b] = plan.gutter!.path;
    const gutterDir = Math.atan2(b.y - a.y, b.x - a.x);
    const edgeDir = Math.atan2(edge.b.y - edge.a.y, edge.b.x - edge.a.x);
    expect(Math.abs(gutterDir - edgeDir)).toBeLessThan(1e-9);
  });

  it('集水桝は既定で2つ', () => {
    expect(planDrainage(bands, edge).basins).toHaveLength(2);
    expect(planDrainage(bands, edge, { basinCount: 3 }).basins).toHaveLength(3);
  });

  it('矢印は必ず放流先を向く（隣接農地の側へ向かない）', () => {
    const plan = planDrainage(bands, edge);
    expect(plan.arrows.length).toBeGreaterThan(0);
    for (const a of plan.arrows) {
      // 矢印の終点は集水桝のどれか
      expect(plan.basins.some((b) => b.x === a.to.x && b.y === a.to.y)).toBe(true);
      // 進む向きが放流先の辺へ近づく向きであること
      const before = distanceToSegment(a.from, edge.a, edge.b);
      const after = distanceToSegment(a.to, edge.a, edge.b);
      expect(after).toBeLessThan(before);
    }
  });

  it('区画が無ければ矢印も無い（桝と側溝は残る）', () => {
    const plan = planDrainage([], edge);
    expect(plan.arrows).toHaveLength(0);
    expect(plan.basins).toHaveLength(2);
    expect(plan.gutter).not.toBeNull();
  });
});

describe('実データの筆での外周の分解', () => {
  const { parcels } = loadMojGeoJson(sample);

  it('登記所備付地図では道路も水路も筆として隣接している（空白では判定できない）', () => {
    // この前提が崩れると「隣に筆が無い側が道路」という推定が使えてしまう。
    // 使えないことをテストで固定しておく。
    const targets = ['327', '441', '312', '362-7'];
    const polys = parcels.map((p) => ({ chiban: p.chiban, outline: p.outline.map((q) => toPlaneXY(q, 9)) }));
    for (const chiban of targets) {
      const me = polys.find((p) => p.chiban === chiban)!;
      const others = polys.filter((p) => p !== me);
      const edges = boundaryEdges(me.outline, others).filter((e) => e.lengthM >= 1.0);
      expect(edges.length).toBeGreaterThan(0);
      // すべての辺の外側に登記された筆がある
      expect(edges.every((e) => e.neighbourChiban !== null)).toBe(true);
    }
  });

  it('実データの筆でも進入口の開口が外周の上に乗る', () => {
    const me = parcels.find((p) => p.chiban === '327')!;
    const outline = me.outline.map((q) => toPlaneXY(q, 9));
    const edge = defaultEntranceEdge(boundaryEdges(outline))!;
    const plan = planEntrance(outline, edge);
    for (const p of plan.opening) {
      expect(distanceToBoundary(outline, p)).toBeLessThan(1e-6);
    }
  });
});

/** 点と線分の距離。テスト側でも独立に持っておく。 */
function distanceToSegment(p: PlaneXY, a: PlaneXY, b: PlaneXY): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-18) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}
