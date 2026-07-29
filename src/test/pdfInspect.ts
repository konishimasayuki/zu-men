/**
 * 生成したPDFのコンテンツストリームを解析して、実際に紙に載る寸法を測る。
 *
 * 検収基準1の「Claude Code側」の検証はこのモジュールが担う。
 * 描画コードの意図ではなく、PDFの中身そのものを読んで測ることに意味がある。
 * 途中に拡大縮小が紛れ込んでも、ここで検出できる。
 */

import { PDFDocument, PDFName, PDFRawStream, PDFArray, PDFDict, decodePDFRawStream } from 'pdf-lib';
import { ptToMm } from '../paper/units';

export interface EmbeddedFontInfo {
  /** /BaseFont の値。サブセット化されると接尾辞が付く。 */
  baseFont: string;
  /** 埋め込まれた字形データの実バイト数。元のフォント実体より十分小さいはず。 */
  fontFileBytes: number;
  /** CIDフォントとして埋め込まれているか。日本語には必須。 */
  isCidFont: boolean;
}

/**
 * 埋め込まれた日本語フォントの情報を取り出す。
 *
 * 生成直後のPDFはオブジェクトストリームで圧縮されているため、
 * バイト列を文字列検索しても /FontFile2 は見つからない。一度読み込んで
 * 間接オブジェクトを走査する必要がある。
 */
export async function readEmbeddedFonts(pdfBytes: Uint8Array): Promise<EmbeddedFontInfo[]> {
  const doc = await PDFDocument.load(pdfBytes);
  const ctx = doc.context;
  const results: EmbeddedFontInfo[] = [];

  for (const [, obj] of ctx.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFDict)) continue;
    const subtype = obj.get(PDFName.of('Subtype'));
    if (String(subtype) !== '/CIDFontType2') continue;

    const baseFont = String(obj.get(PDFName.of('BaseFont')) ?? '');
    const descriptor = ctx.lookup(obj.get(PDFName.of('FontDescriptor')));
    let fontFileBytes = 0;
    if (descriptor instanceof PDFDict) {
      const file = ctx.lookup(descriptor.get(PDFName.of('FontFile2')));
      if (file instanceof PDFRawStream) {
        fontFileBytes = decodePDFRawStream(file).decode().length;
      }
    }
    results.push({ baseFont, fontFileBytes, isCidFont: true });
  }
  return results;
}

export interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** 長さ[pt] */
  lengthPt: number;
  /** 長さ[mm] */
  lengthMm: number;
}

export interface PageGeometry {
  /** MediaBoxの幅[pt] */
  widthPt: number;
  heightPt: number;
  widthMm: number;
  heightMm: number;
  segments: Segment[];
  /** 現在の座標変換行列が単位行列以外に変更された回数。0であるべき。 */
  nonIdentityCtmCount: number;
}

function segment(x1: number, y1: number, x2: number, y2: number): Segment {
  const lengthPt = Math.hypot(x2 - x1, y2 - y1);
  return { x1, y1, x2, y2, lengthPt, lengthMm: ptToMm(lengthPt) };
}

/** ページのコンテンツストリームを1本の文字列に連結して取り出す。 */
async function contentStreamText(pdfBytes: Uint8Array): Promise<{ text: string; widthPt: number; heightPt: number }> {
  const doc = await PDFDocument.load(pdfBytes);
  const page = doc.getPage(0);
  const { width, height } = page.getSize();

  const contents = page.node.get(PDFName.of('Contents'));
  const resolved = page.node.context.lookup(contents);

  const streams: PDFRawStream[] = [];
  if (resolved instanceof PDFRawStream) {
    streams.push(resolved);
  } else if (resolved instanceof PDFArray) {
    for (let i = 0; i < resolved.size(); i++) {
      const s = page.node.context.lookup(resolved.get(i));
      if (s instanceof PDFRawStream) streams.push(s);
    }
  }

  const decoder = new TextDecoder('latin1');
  const text = streams
    .map((s) => decoder.decode(decodePDFRawStream(s).decode()))
    .join('\n');

  return { text, widthPt: width, heightPt: height };
}

/**
 * コンテンツストリームからパスの線分を拾う。
 *
 * 対応する演算子は m（moveto）、l（lineto）、re（rectangle）、cm（座標変換）。
 * pdf-lib の drawLine / drawRectangle が出すのはこれらだけなので足りる。
 * cm が単位行列以外で現れたら、その回数を記録して呼び出し側に知らせる。
 */
export async function readPageGeometry(pdfBytes: Uint8Array): Promise<PageGeometry> {
  const { text, widthPt, heightPt } = await contentStreamText(pdfBytes);

  const segments: Segment[] = [];
  let nonIdentityCtmCount = 0;

  const tokens = text.split(/\s+/).filter((t) => t.length > 0);
  const stack: number[] = [];
  let curX = 0;
  let curY = 0;
  let startX = 0;
  let startY = 0;

  for (const tok of tokens) {
    const num = Number(tok);
    if (Number.isFinite(num) && /^[-+]?[\d.]+$/.test(tok)) {
      stack.push(num);
      continue;
    }

    switch (tok) {
      case 'm': {
        const [x, y] = stack.slice(-2);
        curX = x;
        curY = y;
        startX = x;
        startY = y;
        break;
      }
      case 'l': {
        const [x, y] = stack.slice(-2);
        segments.push(segment(curX, curY, x, y));
        curX = x;
        curY = y;
        break;
      }
      case 'h': {
        if (curX !== startX || curY !== startY) {
          segments.push(segment(curX, curY, startX, startY));
        }
        curX = startX;
        curY = startY;
        break;
      }
      case 're': {
        const [x, y, w, h] = stack.slice(-4);
        segments.push(segment(x, y, x + w, y));
        segments.push(segment(x + w, y, x + w, y + h));
        segments.push(segment(x + w, y + h, x, y + h));
        segments.push(segment(x, y + h, x, y));
        break;
      }
      case 'cm': {
        const [a, b, c, d] = stack.slice(-6);
        const isIdentityScale = a === 1 && b === 0 && c === 0 && d === 1;
        if (!isIdentityScale) nonIdentityCtmCount++;
        break;
      }
      default:
        break;
    }
    stack.length = 0;
  }

  return {
    widthPt,
    heightPt,
    widthMm: ptToMm(widthPt),
    heightMm: ptToMm(heightPt),
    segments,
    nonIdentityCtmCount,
  };
}

/**
 * 指定した長さ[mm]の線分がいくつあるかを数える。
 * @param toleranceMm 許容差[mm]
 */
export function countSegmentsOfLength(geom: PageGeometry, lengthMm: number, toleranceMm: number): number {
  return geom.segments.filter((s) => Math.abs(s.lengthMm - lengthMm) <= toleranceMm).length;
}

/** 指定した長さ[mm]に最も近い線分の実測値[mm]を返す。 */
export function closestSegmentLengthMm(geom: PageGeometry, lengthMm: number): number {
  let best = Infinity;
  let bestDiff = Infinity;
  for (const s of geom.segments) {
    const diff = Math.abs(s.lengthMm - lengthMm);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = s.lengthMm;
    }
  }
  return best;
}
