/**
 * 印刷補正（プリンタキャリブレーション）。
 *
 * プリンタによっては「実際のサイズ（100%）」に設定しても、機構上の理由で
 * 出力が数％伸縮することがある。検証シートを印刷して定規で測り、
 * 表示どおりの長さになっていなければ、その実測値をここに入れて補正する。
 *
 * **補正はPDFの図形全体に倍率をかける。** したがって補正を有効にしたPDFは、
 * データとしては1/250ではなくなる。紙に出したときに1/250になる。
 * 提出するのが紙であればこれで正しいが、PDFをそのまま電子提出する場合は
 * 補正を無効にすること。
 *
 * 縮尺そのもの（paper/transform.ts）には手を触れない。補正は出力段で
 * 一度だけかける独立した変換として扱う。
 */

export interface PrinterCalibration {
  /** 検証シートに表示された長さ[mm]。通常は200。 */
  nominalMm: number;
  /** その線を定規で測った実測値[mm]。 */
  measuredMm: number;
}

/**
 * 補正倍率の許容範囲。
 *
 * これを外れるのはプリンタの機構誤差ではなく設定ミス（「用紙に合わせる」が
 * 有効になっている等）か、測り間違いである。補正で辻褄を合わせるのではなく
 * 原因を直すべきなので、受け付けない。
 */
export const MIN_FACTOR = 0.95;
export const MAX_FACTOR = 1.05;

export class CalibrationRangeError extends Error {
  constructor(readonly factor: number) {
    super(
      `補正倍率 ${factor.toFixed(4)} は許容範囲（${MIN_FACTOR}〜${MAX_FACTOR}）を超えています。` +
        'プリンタ設定が「実際のサイズ（100%）」になっているか、測り間違いがないかを先に確認してください。',
    );
    this.name = 'CalibrationRangeError';
  }
}

/**
 * 補正倍率を求める。
 *
 * 80mmのはずが79.2mmで出たなら、80/79.2 = 1.0101 倍に描いておけば
 * 印刷後に80.0mmになる。
 */
export function calibrationFactor(c: PrinterCalibration): number {
  if (!(c.nominalMm > 0) || !(c.measuredMm > 0)) {
    throw new Error('基準長と実測値は正の数で指定してください');
  }
  const factor = c.nominalMm / c.measuredMm;
  if (factor < MIN_FACTOR || factor > MAX_FACTOR) throw new CalibrationRangeError(factor);
  return factor;
}

/** 補正が実質的に無効（等倍）かどうか。 */
export function isIdentity(c: PrinterCalibration | undefined): boolean {
  if (!c) return true;
  return Math.abs(calibrationFactor(c) - 1) < 1e-9;
}

/**
 * 用紙の中心を固定して全体を倍率fで拡大縮小する行列 [a b c d e f]。
 *
 * 中心を固定するのは、四辺の余白が均等に変化するようにするため。
 * 左下を固定すると補正を強めたときに右上だけがはみ出す。
 */
export function calibrationMatrix(
  factor: number,
  pageWidthPt: number,
  pageHeightPt: number,
): [number, number, number, number, number, number] {
  const cx = pageWidthPt / 2;
  const cy = pageHeightPt / 2;
  return [factor, 0, 0, factor, cx * (1 - factor), cy * (1 - factor)];
}
