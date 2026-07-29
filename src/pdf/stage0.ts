/**
 * 第0段階 — 縮尺とフォントの実証。
 *
 * 20.000m×20.000m の正方形を1つだけ描いたA3横のPDFと、
 * 100mm・200mm の基準線を入れた検証用PDFを出す。
 *
 * 目的は、生成したPDFを「実際のサイズ（100%）」で印刷したときに
 * 20mの辺が定規で80.0mmになることを、依頼者が実測で確かめられるようにすること。
 */

import { rgb } from 'pdf-lib';
import { mmToPt } from '../paper/units';
import { DEFAULT_PAPER, PaperSize, frameOf } from '../paper/layout';
import { DEFAULT_SCALE_DENOMINATOR, createProjector, metersToPaperMm } from '../paper/transform';
import type { PlaneXY } from '../paper/transform';
import { createSheet } from './document';
import { drawSheet, LINE_WIDTH_MM, TitleBlockRow } from './frame';

const BLACK = rgb(0, 0, 0);

/** 検証用の正方形の1辺[m]。検収基準1・2がこの値に依存している。 */
export const VERIFICATION_SQUARE_SIDE_M = 20;

/**
 * 20m正方形の頂点（平面直角座標、X=北・Y=東）。
 * 原点は任意。第1段階で実データに差し替わる。
 */
export function verificationSquare(originX = 0, originY = 0): PlaneXY[] {
  const s = VERIFICATION_SQUARE_SIDE_M;
  return [
    { x: originX, y: originY },
    { x: originX, y: originY + s },
    { x: originX + s, y: originY + s },
    { x: originX + s, y: originY },
  ];
}

export interface Stage0Options {
  scaleDenominator?: number;
  /** 用紙。既定は依頼者のプリンタに合わせてA4横。 */
  paper?: PaperSize;
  titleBlockRows?: readonly TitleBlockRow[];
}

/** 20m正方形1つだけの図面PDF。 */
export async function buildStage0Pdf(
  fontBytes: Uint8Array | ArrayBuffer,
  opts: Stage0Options = {},
): Promise<Uint8Array> {
  const scale = opts.scaleDenominator ?? DEFAULT_SCALE_DENOMINATOR;
  const size = opts.paper ?? DEFAULT_PAPER;
  const { doc, page, font } = await createSheet(size, fontBytes);

  drawSheet(page, {
    size,
    font,
    title: `計画平面図　S＝1/${scale}`,
    titleBlockRows: opts.titleBlockRows ?? [],
  });

  // 正方形を図郭の中央に置く
  const f = frameOf(size);
  const sideMm = metersToPaperMm(VERIFICATION_SQUARE_SIDE_M, scale);
  const originMm = {
    x: f.xMm + (f.widthMm - sideMm) / 2,
    y: f.yMm + (f.heightMm - sideMm) / 2,
  };
  const square = verificationSquare();
  const project = createProjector({ x: 0, y: 0 }, scale);

  const pts = square.map((p) => {
    const m = project(p);
    return { x: mmToPt(originMm.x + m.mmX), y: mmToPt(originMm.y + m.mmY) };
  });

  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    page.drawLine({ start: a, end: b, color: BLACK, thickness: mmToPt(0.4) });
  }

  page.drawText(`20.000m × 20.000m（この辺は紙上 ${sideMm.toFixed(1)}mm）`, {
    x: mmToPt(originMm.x),
    y: mmToPt(originMm.y - 6),
    size: mmToPt(3.2),
    font,
    color: BLACK,
  });

  return doc.save();
}

/**
 * 検証シートの注意書き。用紙名を埋め込むので、用紙を変えたら文言も変わる。
 * ここを固定文字列にすると「A4なのにA3で印刷しろ」と書かれた紙が出る。
 */
export function buildCalibrationNote(size: PaperSize): string[] {
  return [
    `プリンタ設定を「実際のサイズ（100%）」にして${size.name}で印刷し、上の線を定規で測ってください。`,
    '「用紙に合わせる」「フィット」を選ぶと数％縮んで縮尺が狂います。',
    '3本すべてが表示どおりの長さであれば、縮尺は正しく出力されています。',
  ];
}

/**
 * 検証用PDF。100mmと200mmの基準線を入れる。
 * 印刷後に定規を当てるためのものなので、余計な装飾を入れない。
 */
export async function buildCalibrationPdf(
  fontBytes: Uint8Array | ArrayBuffer,
  paper: PaperSize = DEFAULT_PAPER,
): Promise<Uint8Array> {
  const size = paper;
  const { doc, page, font } = await createSheet(size, fontBytes);
  const f = frameOf(size);

  drawSheet(page, { size, font, title: `縮尺検証シート　${size.name}　S＝1/250` });

  const bars: Array<{ lengthMm: number; label: string }> = [
    { lengthMm: 100, label: '100mm（実長 25.000m）' },
    { lengthMm: 200, label: '200mm（実長 50.000m）' },
    { lengthMm: metersToPaperMm(VERIFICATION_SQUARE_SIDE_M), label: '80mm（実長 20.000m）' },
  ];

  let y = f.yMm + f.heightMm - 60;
  for (const bar of bars) {
    const x = f.xMm + 20;
    // 本体
    page.drawLine({
      start: { x: mmToPt(x), y: mmToPt(y) },
      end: { x: mmToPt(x + bar.lengthMm), y: mmToPt(y) },
      color: BLACK,
      thickness: mmToPt(0.4),
    });
    // 両端の目印
    for (const tx of [x, x + bar.lengthMm]) {
      page.drawLine({
        start: { x: mmToPt(tx), y: mmToPt(y - 3) },
        end: { x: mmToPt(tx), y: mmToPt(y + 3) },
        color: BLACK,
        thickness: mmToPt(0.4),
      });
    }
    page.drawText(bar.label, {
      x: mmToPt(x),
      y: mmToPt(y + 5),
      size: mmToPt(3.2),
      font,
      color: BLACK,
    });
    y -= 30;
  }

  const note = buildCalibrationNote(size);
  let ny = y - 6;
  for (const n of note) {
    page.drawText(n, { x: mmToPt(f.xMm + 20), y: mmToPt(ny), size: mmToPt(3.2), font, color: BLACK });
    ny -= 6;
  }

  return doc.save();
}

/** LINE_WIDTH_MM を再輸出しておく（呼び出し側の import を1本にするため）。 */
export { LINE_WIDTH_MM };
