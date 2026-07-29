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
  /** すべて座標変換行列(CTM)を適用したあとの、実際に紙に載る位置と長さ。 */
  segments: Segment[];
  /** 拡大縮小を伴う座標変換の回数。印刷補正が無効なら0であるべき。 */
  nonIdentityCtmCount: number;
  /** 検出した拡大縮小の倍率。等倍なら空配列。 */
  ctmScales: number[];
}

/** PDFの座標変換行列 [a b c d e f]。 */
type Matrix = [number, number, number, number, number, number];

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** m を先に、次に n を適用する合成（PDFの cm と同じ順序）。 */
function multiply(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[1] * n[2],
    m[0] * n[1] + m[1] * n[3],
    m[2] * n[0] + m[3] * n[2],
    m[2] * n[1] + m[3] * n[3],
    m[4] * n[0] + m[5] * n[2] + n[4],
    m[4] * n[1] + m[5] * n[3] + n[5],
  ];
}

function apply(m: Matrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
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
  const ctmScales: number[] = [];

  // 現在の座標変換行列と、q / Q のためのスタック。
  // 線分の長さは必ずCTMを適用してから測る。そうしないと cm による
  // 拡大縮小を見逃し、「80mmと書いてあるが実際は80.8mm」を通してしまう。
  let ctm: Matrix = [...IDENTITY] as Matrix;
  const ctmStack: Matrix[] = [];

  const tokens = text.split(/\s+/).filter((t) => t.length > 0);
  const stack: number[] = [];
  let curX = 0;
  let curY = 0;
  let startX = 0;
  let startY = 0;

  const seg = (x1: number, y1: number, x2: number, y2: number) => {
    const [ax, ay] = apply(ctm, x1, y1);
    const [bx, by] = apply(ctm, x2, y2);
    segments.push(segment(ax, ay, bx, by));
  };

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
        seg(curX, curY, x, y);
        curX = x;
        curY = y;
        break;
      }
      case 'h': {
        if (curX !== startX || curY !== startY) seg(curX, curY, startX, startY);
        curX = startX;
        curY = startY;
        break;
      }
      case 're': {
        const [x, y, w, h] = stack.slice(-4);
        seg(x, y, x + w, y);
        seg(x + w, y, x + w, y + h);
        seg(x + w, y + h, x, y + h);
        seg(x, y + h, x, y);
        break;
      }
      case 'q': {
        ctmStack.push([...ctm] as Matrix);
        break;
      }
      case 'Q': {
        const popped = ctmStack.pop();
        if (popped) ctm = popped;
        break;
      }
      case 'cm': {
        const [a, b, c, d, e, f] = stack.slice(-6);
        const m: Matrix = [a, b, c, d, e, f];
        if (!(a === 1 && b === 0 && c === 0 && d === 1)) {
          nonIdentityCtmCount++;
          ctmScales.push(Math.hypot(a, b));
        }
        ctm = multiply(m, ctm);
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
    ctmScales,
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
