import { describe, it, expect } from 'vitest';
import { PT_PER_MM, mmToPt, ptToMm } from './units';
import {
  metersToPaperMm,
  paperMmToMeters,
  metersToPt,
  createProjector,
  createInverseProjector,
} from './transform';

describe('単位変換', () => {
  it('1mm = 2.834645669pt', () => {
    expect(PT_PER_MM).toBeCloseTo(2.834645669, 9);
    expect(mmToPt(1)).toBeCloseTo(2.834645669, 9);
  });

  it('25.4mm = 72pt（1インチ）', () => {
    expect(mmToPt(25.4)).toBeCloseTo(72, 10);
  });

  it('mm→pt→mm で戻る', () => {
    expect(ptToMm(mmToPt(123.456))).toBeCloseTo(123.456, 10);
  });
});

describe('縮尺変換 1/250', () => {
  it('1m は紙上 4mm', () => {
    expect(metersToPaperMm(1)).toBeCloseTo(4, 12);
  });

  it('検収基準1: 20mの辺は紙上 80.000mm', () => {
    expect(metersToPaperMm(20)).toBeCloseTo(80, 12);
  });

  it('検収基準1: 20mの辺は 226.772pt', () => {
    expect(metersToPt(20)).toBeCloseTo(226.7716535433071, 9);
  });

  it('100mm は実長 25.000m、200mm は実長 50.000m', () => {
    expect(paperMmToMeters(100)).toBeCloseTo(25, 12);
    expect(paperMmToMeters(200)).toBeCloseTo(50, 12);
  });

  it('A3の描画域 390×267mm は実寸 97.5m×66.75m', () => {
    expect(paperMmToMeters(390)).toBeCloseTo(97.5, 12);
    expect(paperMmToMeters(267)).toBeCloseTo(66.75, 12);
  });
});

describe('平面直角座標から紙面への射影', () => {
  const origin = { x: 100_000, y: -50_000 };

  it('北方向(X)が紙の縦軸、東方向(Y)が紙の横軸になる', () => {
    const project = createProjector(origin);
    // 原点から北へ10m
    expect(project({ x: origin.x + 10, y: origin.y })).toEqual({ mmX: 0, mmY: 40 });
    // 原点から東へ10m
    expect(project({ x: origin.x, y: origin.y + 10 })).toEqual({ mmX: 40, mmY: 0 });
  });

  it('射影と逆射影が往復する', () => {
    const project = createProjector(origin);
    const unproject = createInverseProjector(origin);
    const p = { x: origin.x + 33.333, y: origin.y - 12.5 };
    const back = unproject(project(p));
    expect(back.x).toBeCloseTo(p.x, 9);
    expect(back.y).toBeCloseTo(p.y, 9);
  });

  it('縮尺分母を変えても射影が破綻しない', () => {
    const project = createProjector(origin, 500);
    expect(project({ x: origin.x + 20, y: origin.y })).toEqual({ mmX: 0, mmY: 40 });
  });
});
