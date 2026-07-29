/**
 * 計画平面図の生成。
 *
 * 図枠まわり（frame.ts）と図面の中身（drawScene.ts）を組み合わせる。
 * 体裁は参考図面に合わせる。
 */

import {
  DEFAULT_PAPER, PaperSize, frameOf, frameExtentMeters, smallestPaperFor, FRAME_INNER_OFFSET_MM,
} from '../paper/layout';
import { DEFAULT_SCALE_DENOMINATOR, PlaneXY } from '../paper/transform';
import type { PrinterCalibration } from '../paper/calibration';
import { Scene, boundsOf, subjectBoundsOf } from '../draw/scene';
import { createSheet } from './document';
import { drawSheet } from './frame';
import { Pen } from './pen';
import { drawSceneContent } from './drawScene';

export interface PlanOptions {
  paper?: PaperSize;
  scaleDenominator?: number;
  calibration?: PrinterCalibration;
  /**
   * 図郭左下に対応する平面直角座標。省略すると図面全体が図郭の中央に来るように置く。
   * 画面で用紙をドラッグしたときはこの値が更新される。
   */
  origin?: PlaneXY;
}

export interface FitResult {
  /** 図面全体の広がり[m]。 */
  contentWidthM: number;
  contentHeightM: number;
  /** 図郭に入る実寸[m]。 */
  frameWidthM: number;
  frameHeightM: number;
  fits: boolean;
  /** 収まらない場合に提案する用紙。無ければnull。 */
  suggestion: PaperSize | null;
}

/**
 * 図面が用紙に収まるかを調べる。縮小印刷は提案しない。
 *
 * 既定では**申請地**の広がりで判定する。周辺の筆は図郭の外まで続いていて当然で、
 * 図郭でクリップして端で切る前提だから、収まり判定に混ぜない。
 * `includeSurroundings` を立てると図面全体で判定する。
 */
export function checkFit(
  scene: Scene,
  paper: PaperSize,
  scaleDenominator: number,
  opts: { includeSurroundings?: boolean } = {},
): FitResult {
  const b = opts.includeSurroundings ? boundsOf(scene) : (subjectBoundsOf(scene) ?? boundsOf(scene));
  const extent = frameExtentMeters(paper, scaleDenominator);
  const contentWidthM = b?.widthM ?? 0;
  const contentHeightM = b?.heightM ?? 0;
  const fits = contentWidthM <= extent.widthM && contentHeightM <= extent.heightM;
  return {
    contentWidthM,
    contentHeightM,
    frameWidthM: extent.widthM,
    frameHeightM: extent.heightM,
    fits,
    suggestion: fits ? null : smallestPaperFor(contentWidthM, contentHeightM, scaleDenominator),
  };
}

/** 図面全体が図郭の中央に来る origin を求める。 */
export function centeredOrigin(scene: Scene, paper: PaperSize, scaleDenominator: number): PlaneXY {
  const b = boundsOf(scene);
  if (!b) return { x: 0, y: 0 };
  const extent = frameExtentMeters(paper, scaleDenominator);
  // 図郭の左下が世界のどこに当たるか。X=北が縦、Y=東が横。
  return {
    x: (b.minX + b.maxX) / 2 - extent.heightM / 2,
    y: (b.minY + b.maxY) / 2 - extent.widthM / 2,
  };
}

/**
 * 指定した1点が図郭の中央に来る origin を求める。
 *
 * 「地図で指した場所の計画平面図」を出すときは、図面の外接矩形ではなく
 * ピンそのものを中心に据える。ユーザーが指した点が紙の真ん中に来る。
 */
export function originCenteredOn(
  point: PlaneXY,
  paper: PaperSize,
  scaleDenominator: number,
): PlaneXY {
  const extent = frameExtentMeters(paper, scaleDenominator);
  return {
    x: point.x - extent.heightM / 2,
    y: point.y - extent.widthM / 2,
  };
}

export async function buildPlanPdf(
  scene: Scene,
  fontBytes: Uint8Array | ArrayBuffer,
  opts: PlanOptions = {},
): Promise<Uint8Array> {
  const paper = opts.paper ?? DEFAULT_PAPER;
  const scale = opts.scaleDenominator ?? DEFAULT_SCALE_DENOMINATOR;
  const { doc, page, font } = await createSheet(paper, fontBytes, opts.calibration);

  const frame = frameOf(paper);
  const pen = new Pen(page, font);
  const layout = {
    origin: opts.origin ?? centeredOrigin(scene, paper, scale),
    frameOriginMm: { mmX: frame.xMm, mmY: frame.yMm },
    scaleDenominator: scale,
  };

  // 周辺の筆や道路は図郭の外まで続く。図枠を突き抜けないよう内側で切る。
  // 二重図枠の内側の線から、さらにわずかに内へ入れる。
  const inset = FRAME_INNER_OFFSET_MM + 0.6;
  pen.clipped(
    { mmX: frame.xMm + inset, mmY: frame.yMm + inset },
    frame.widthMm - inset * 2,
    frame.heightMm - inset * 2,
    () => drawSceneContent(pen, scene, layout),
  );

  // 図枠・表題・方位は中身の上に載せる。周辺の筆界が表題枠を横切らないようにするため。
  drawSheet(page, { size: paper, font, title: `計画平面図　S＝1/${scale}` });

  return doc.save();
}
