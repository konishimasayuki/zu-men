import { describe, it, expect } from 'vitest';
import { doubleArea, area, perimeter, closureError, isClosureAcceptable } from './area';
import { verificationSquare } from '../pdf/stage0';

describe('座標法による面積計算', () => {
  it('検収基準2: 20.000m×20.000mの正方形は 400.00㎡', () => {
    const square = verificationSquare();
    expect(area(square)).toBeCloseTo(400.0, 9);
    expect(area(square).toFixed(2)).toBe('400.00');
  });

  it('倍面積は面積の2倍', () => {
    expect(Math.abs(doubleArea(verificationSquare()))).toBeCloseTo(800, 9);
  });

  it('頂点の並び順を逆にしても面積は同じ', () => {
    const square = verificationSquare();
    expect(area([...square].reverse())).toBeCloseTo(400.0, 9);
  });

  it('倍面積は並び順で符号が反転する', () => {
    const square = verificationSquare();
    expect(Math.sign(doubleArea(square))).toBe(-Math.sign(doubleArea([...square].reverse())));
  });

  it('原点を平行移動しても面積は変わらない', () => {
    const moved = verificationSquare(123456.789, -54321.987);
    expect(area(moved)).toBeCloseTo(400.0, 6);
  });

  it('三角形（底辺30m・高さ20m）は 300㎡', () => {
    const tri = [
      { x: 0, y: 0 },
      { x: 0, y: 30 },
      { x: 20, y: 0 },
    ];
    expect(area(tri)).toBeCloseTo(300, 9);
  });

  it('凹多角形も正しく計算する（L字型 = 400 - 100 = 300㎡）', () => {
    const l = [
      { x: 0, y: 0 },
      { x: 0, y: 20 },
      { x: 10, y: 20 },
      { x: 10, y: 10 },
      { x: 20, y: 10 },
      { x: 20, y: 0 },
    ];
    expect(area(l)).toBeCloseTo(300, 9);
  });

  it('2点以下では0を返す', () => {
    expect(area([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBe(0);
  });

  it('20m正方形の外周長は80m', () => {
    expect(perimeter(verificationSquare())).toBeCloseTo(80, 9);
  });
});

describe('閉合誤差', () => {
  it('完全に閉合する四辺形は誤差0', () => {
    const err = closureError({
      bearingsDeg: [0, 90, 180, 270],
      distances: [20, 20, 20, 20],
    });
    // 三角関数の丸め誤差(約5e-15m)は閉合差ゼロに丸める。
    // そうしないと「1/15653325707569116」のような無意味な精度が表示される。
    expect(err.distance).toBe(0);
    expect(err.precisionDenominator).toBe(Infinity);
    expect(isClosureAcceptable(err)).toBe(true);
  });

  it('丸め誤差より大きい閉合差は丸めずに残す', () => {
    const err = closureError({
      bearingsDeg: [0, 90, 180, 270],
      distances: [20, 20, 20, 20.0000001],
    });
    expect(err.distance).toBeGreaterThan(0);
    expect(err.distance).toBeCloseTo(1e-7, 12);
  });

  it('検収基準4: 閉合しない辺長を入れると誤差が数値で出る', () => {
    // 最後の辺だけ20mではなく20.05mにする
    const err = closureError({
      bearingsDeg: [0, 90, 180, 270],
      distances: [20, 20, 20, 20.05],
    });
    expect(err.distance).toBeCloseTo(0.05, 9);
    expect(err.totalLength).toBeCloseTo(80.05, 9);
    // 80.05 / 0.05 = 1601
    expect(err.precisionDenominator).toBeCloseTo(1601, 0);
  });

  it('検収基準4: 許容範囲を超える閉合差は無警告で通過しない', () => {
    const err = closureError({
      bearingsDeg: [0, 90, 180, 270],
      distances: [20, 20, 20, 20.05],
    });
    // 1/1601 は 1/5000 より粗いので不合格
    expect(isClosureAcceptable(err, 5000)).toBe(false);
  });

  it('十分小さい閉合差は許容される', () => {
    const err = closureError({
      bearingsDeg: [0, 90, 180, 270],
      distances: [20, 20, 20, 20.005],
    });
    // 80.005 / 0.005 = 16001 → 1/5000 より細かい
    expect(isClosureAcceptable(err, 5000)).toBe(true);
  });

  it('方位角と距離の数が違えば例外', () => {
    expect(() => closureError({ bearingsDeg: [0, 90], distances: [10] })).toThrow();
  });
});
