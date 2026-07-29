/**
 * 紙面の単位変換。
 *
 * PDFの内部単位はpt（1/72インチ）。図面はすべてmmで組み立て、
 * pdf-libに渡す直前でだけptに変換する。
 */

/** 1mm あたりのpt数。25.4mm = 72pt より 72 / 25.4。 */
export const PT_PER_MM = 2.834645669291339;

export function mmToPt(mm: number): number {
  return mm * PT_PER_MM;
}

export function ptToMm(pt: number): number {
  return pt / PT_PER_MM;
}
