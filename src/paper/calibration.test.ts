import { describe, it, expect } from 'vitest';
import {
  calibrationFactor,
  calibrationMatrix,
  isIdentity,
  CalibrationRangeError,
  MIN_FACTOR,
  MAX_FACTOR,
} from './calibration';

describe('補正倍率', () => {
  it('実測値が表示どおりなら倍率は1', () => {
    expect(calibrationFactor({ nominalMm: 200, measuredMm: 200 })).toBe(1);
    expect(isIdentity({ nominalMm: 200, measuredMm: 200 })).toBe(true);
  });

  it('未指定なら補正なし扱い', () => {
    expect(isIdentity(undefined)).toBe(true);
  });

  it('縮んで出るプリンタは倍率が1より大きくなる', () => {
    // 200mmのはずが198mmで出た → 200/198 = 1.0101 倍に描く
    expect(calibrationFactor({ nominalMm: 200, measuredMm: 198 })).toBeCloseTo(1.010101, 6);
  });

  it('伸びて出るプリンタは倍率が1より小さくなる', () => {
    expect(calibrationFactor({ nominalMm: 200, measuredMm: 202 })).toBeCloseTo(0.990099, 6);
  });

  it('補正をかけた長さが元に戻る', () => {
    const measured = 198;
    const f = calibrationFactor({ nominalMm: 200, measuredMm: measured });
    // 200mmを f 倍で描くと 202.02mm になり、それが 198/200 に縮んで印刷される
    const printed = 200 * f * (measured / 200);
    expect(printed).toBeCloseTo(200, 9);
  });

  it('許容範囲を超える倍率は拒否する（設定ミスを補正で隠さない）', () => {
    // 「用紙に合わせる」が有効だと 200mm が 190mm 程度で出る
    expect(() => calibrationFactor({ nominalMm: 200, measuredMm: 190 })).toThrow(CalibrationRangeError);
    expect(() => calibrationFactor({ nominalMm: 200, measuredMm: 215 })).toThrow(CalibrationRangeError);
  });

  it('許容範囲の内側は受け付ける', () => {
    expect(() => calibrationFactor({ nominalMm: 200, measuredMm: 200 / MAX_FACTOR })).not.toThrow();
    expect(() => calibrationFactor({ nominalMm: 200, measuredMm: 200 / MIN_FACTOR })).not.toThrow();
  });

  it('0や負の値は拒否する', () => {
    expect(() => calibrationFactor({ nominalMm: 200, measuredMm: 0 })).toThrow();
    expect(() => calibrationFactor({ nominalMm: 0, measuredMm: 200 })).toThrow();
    expect(() => calibrationFactor({ nominalMm: 200, measuredMm: -1 })).toThrow();
  });
});

describe('補正行列', () => {
  const W = 841.89;
  const H = 595.28;

  it('倍率1なら単位行列', () => {
    expect(calibrationMatrix(1, W, H)).toEqual([1, 0, 0, 1, 0, 0]);
  });

  it('用紙の中心が動かない', () => {
    const [a, , , d, e, f] = calibrationMatrix(1.01, W, H);
    const cx = W / 2;
    const cy = H / 2;
    expect(a * cx + e).toBeCloseTo(cx, 9);
    expect(d * cy + f).toBeCloseTo(cy, 9);
  });

  it('長さが倍率どおりに変わる', () => {
    const [a, , , , e] = calibrationMatrix(1.01, W, H);
    const x1 = 100;
    const x2 = 300;
    const len = (a * x2 + e) - (a * x1 + e);
    expect(len).toBeCloseTo(200 * 1.01, 9);
  });
});
