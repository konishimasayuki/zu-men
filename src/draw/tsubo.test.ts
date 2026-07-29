import { describe, it, expect } from 'vitest';
import { M2_PER_TSUBO, tsuboToM2, m2ToTsubo, formatTsuboWithM2, squareSideM } from './tsubo';

describe('坪と平方メートル', () => {
  it('1坪 = 400/121 ㎡（計量法の定義）', () => {
    expect(M2_PER_TSUBO).toBe(400 / 121);
    expect(M2_PER_TSUBO).toBeCloseTo(3.3057851239669, 12);
  });

  it('対象2件の面積', () => {
    expect(tsuboToM2(90)).toBeCloseTo(297.52, 2);
    expect(tsuboToM2(143)).toBeCloseTo(472.73, 2);
  });

  it('往復して戻る', () => {
    expect(m2ToTsubo(tsuboToM2(143))).toBeCloseTo(143, 12);
    expect(tsuboToM2(m2ToTsubo(472.7))).toBeCloseTo(472.7, 12);
  });

  it('坪と㎡を併記できる', () => {
    expect(formatTsuboWithM2(143)).toBe('143坪（472.7㎡）');
    expect(formatTsuboWithM2(90)).toBe('90坪（297.5㎡）');
  });

  it('正方形とみなした一辺', () => {
    expect(squareSideM(tsuboToM2(90))).toBeCloseTo(17.25, 2);
    expect(squareSideM(tsuboToM2(143))).toBeCloseTo(21.74, 2);
  });

  it('参考図面の敷地は依頼者の143坪より大幅に広い', () => {
    // 参考図面 約1337㎡ ＝ 約404坪
    expect(m2ToTsubo(1337)).toBeCloseTo(404.4, 1);
    expect(1337 / tsuboToM2(143)).toBeCloseTo(2.83, 2);
  });
});
