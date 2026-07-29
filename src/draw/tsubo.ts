/**
 * 坪と平方メートルの換算。
 *
 * 依頼者は坪で土地を把握している。図面には㎡で記入するが、
 * 画面や検討では坪も併記して、取り違えが起きないようにする。
 *
 * 1坪 = 6尺 × 6尺。1尺 = 10/33 m なので
 * 1坪 = (60/33)^2 = 400/121 ㎡ = 3.3057851239669…㎡
 * 計量法では「1坪＝400/121平方メートル」と定義されている。
 */

/** 1坪の平方メートル数。有理数 400/121 をそのまま持つ。 */
export const M2_PER_TSUBO = 400 / 121;

export function tsuboToM2(tsubo: number): number {
  return tsubo * M2_PER_TSUBO;
}

export function m2ToTsubo(m2: number): number {
  return m2 / M2_PER_TSUBO;
}

/** 「143坪（472.7㎡）」のような表記。 */
export function formatTsuboWithM2(tsubo: number): string {
  return `${tsubo}坪（${tsuboToM2(tsubo).toFixed(1)}㎡）`;
}

/**
 * 面積[㎡]から、正方形とみなしたときの一辺[m]。
 * 用紙に収まるかの見積りに使う。実際の敷地は正方形ではないので目安。
 */
export function squareSideM(areaM2: number): number {
  return Math.sqrt(areaM2);
}
