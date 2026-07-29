import { describe, it, expect } from 'vitest';
import { makeBand, countStalls, DEFAULT_STALL } from './parking';
import { area } from '../geo/area';

describe('駐車区画の割付', () => {
  it('既定値は 2.5m × 5.0m、車路 5.5m', () => {
    expect(DEFAULT_STALL.widthM).toBe(2.5);
    expect(DEFAULT_STALL.depthM).toBe(5.0);
    expect(DEFAULT_STALL.aisleM).toBe(5.5);
  });

  it('5台の帯は 12.5m × 5.0m になる', () => {
    const band = makeBand({ origin: { x: 0, y: 0 }, runBearingDeg: 0, count: 5, depthLeft: false });
    expect(area(band.outline)).toBeCloseTo(12.5 * 5.0, 9);
    expect(band.stalls).toHaveLength(5);
  });

  it('マスの中心が 2.5m 間隔で並ぶ', () => {
    const band = makeBand({ origin: { x: 0, y: 0 }, runBearingDeg: 0, count: 4, depthLeft: false });
    for (let i = 1; i < band.stalls.length; i++) {
      const a = band.stalls[i - 1].center;
      const b = band.stalls[i].center;
      expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeCloseTo(2.5, 9);
    }
  });

  it('方位角0度の帯は北へ伸びる', () => {
    const band = makeBand({ origin: { x: 0, y: 0 }, runBearingDeg: 0, count: 2, depthLeft: false });
    // 1台目の中心は北へ1.25m、東へ2.5m（奥行きの半分）
    expect(band.stalls[0].center.x).toBeCloseTo(1.25, 9);
    expect(band.stalls[0].center.y).toBeCloseTo(2.5, 9);
  });

  it('車は車路側を向く', () => {
    // depthLeft=false なら帯は進行方向の右へ伸び、車は左（車路側）を向く
    const band = makeBand({ origin: { x: 0, y: 0 }, runBearingDeg: 0, count: 1, depthLeft: false });
    expect(((band.stalls[0].bearingDeg % 360) + 360) % 360).toBeCloseTo(270, 9);
  });

  it('奥行きの向きを反転できる', () => {
    const right = makeBand({ origin: { x: 0, y: 0 }, runBearingDeg: 0, count: 1, depthLeft: false });
    const left = makeBand({ origin: { x: 0, y: 0 }, runBearingDeg: 0, count: 1, depthLeft: true });
    expect(right.stalls[0].center.y).toBeCloseTo(2.5, 9);
    expect(left.stalls[0].center.y).toBeCloseTo(-2.5, 9);
  });

  it('マスの寸法を変えられる', () => {
    const band = makeBand({
      origin: { x: 0, y: 0 }, runBearingDeg: 0, count: 3, depthLeft: false,
      widthM: 3.0, depthM: 6.0,
    });
    expect(area(band.outline)).toBeCloseTo(9.0 * 6.0, 9);
  });

  it('台数を数える。車を置かないマスは除く', () => {
    const band = makeBand({ origin: { x: 0, y: 0 }, runBearingDeg: 0, count: 4, depthLeft: false });
    expect(countStalls([band])).toBe(4);
    band.stalls[0].withCar = false;
    expect(countStalls([band])).toBe(3);
  });
});
