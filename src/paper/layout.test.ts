import { describe, it, expect } from 'vitest';
import { PAPER_SIZES, frameOf, frameExtentMeters, smallestPaperFor } from './layout';

describe('用紙と図郭', () => {
  it('A3横は 420×297mm', () => {
    expect(PAPER_SIZES.A3.widthMm).toBe(420);
    expect(PAPER_SIZES.A3.heightMm).toBe(297);
  });

  it('図郭は左に綴じ代20mmを取る', () => {
    const f = frameOf(PAPER_SIZES.A3);
    expect(f.xMm).toBe(20);
    expect(f.widthMm).toBe(385);
    expect(f.heightMm).toBe(267);
  });

  it('A3の図郭は実寸 96.25m × 66.75m に相当する', () => {
    const e = frameExtentMeters(PAPER_SIZES.A3, 250);
    expect(e.widthM).toBeCloseTo(96.25, 9);
    expect(e.heightM).toBeCloseTo(66.75, 9);
  });

  it('小さい敷地はA3が選ばれる', () => {
    expect(smallestPaperFor(40, 40, 250)?.name).toBe('A3');
  });

  it('A3に収まらない敷地はA2が提案される', () => {
    // A2の図郭は 559×390mm = 139.75m × 97.5m
    expect(smallestPaperFor(120, 80, 250)?.name).toBe('A2');
  });

  it('A2にも収まらない敷地はA1が提案される', () => {
    expect(smallestPaperFor(190, 130, 250)?.name).toBe('A1');
  });

  it('A1にも収まらなければ null', () => {
    expect(smallestPaperFor(500, 500, 250)).toBeNull();
  });
});
