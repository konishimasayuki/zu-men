import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { buildStage0Pdf, buildCalibrationPdf } from './stage0';
import { PAPER_SIZES } from '../paper/layout';
import {
  readPageGeometry,
  countSegmentsOfLength,
  closestSegmentLengthMm,
  readEmbeddedFonts,
} from '../test/pdfInspect';
import { mmToPt } from '../paper/units';

const FONT_PATH = resolve(__dirname, '../../public/fonts/ipaexg.ttf');

let fontBytes: Uint8Array;
beforeAll(() => {
  fontBytes = new Uint8Array(readFileSync(FONT_PATH));
});

describe('第0段階のPDF', () => {
  it('既定はA4横。用紙寸法が 297×210mm ちょうどになる', async () => {
    const pdf = await buildStage0Pdf(fontBytes);
    const geom = await readPageGeometry(pdf);
    expect(geom.widthMm).toBeCloseTo(297, 6);
    expect(geom.heightMm).toBeCloseTo(210, 6);
    expect(geom.widthPt).toBeCloseTo(mmToPt(297), 6);
    expect(geom.heightPt).toBeCloseTo(mmToPt(210), 6);
  });

  it('用紙をA3に切り替えると 420×297mm になる', async () => {
    const pdf = await buildStage0Pdf(fontBytes, { paper: PAPER_SIZES.A3 });
    const geom = await readPageGeometry(pdf);
    expect(geom.widthMm).toBeCloseTo(420, 6);
    expect(geom.heightMm).toBeCloseTo(297, 6);
  });

  it('用紙を変えても20mの辺の長さは変わらない（縮尺は用紙に依存しない）', async () => {
    for (const paper of [PAPER_SIZES.A4, PAPER_SIZES.A3, PAPER_SIZES.A2, PAPER_SIZES.A1]) {
      const geom = await readPageGeometry(await buildStage0Pdf(fontBytes, { paper }));
      expect(closestSegmentLengthMm(geom, 80)).toBeCloseTo(80, 6);
    }
  });

  it('検収基準1: 20mの辺が 226.772pt（±0.01）で出力されている', async () => {
    const pdf = await buildStage0Pdf(fontBytes);
    const geom = await readPageGeometry(pdf);

    const expectedPt = 226.7716535433071;
    const matches = geom.segments.filter((s) => Math.abs(s.lengthPt - expectedPt) <= 0.01);

    // 正方形なので4辺すべてが一致するはず
    expect(matches.length).toBe(4);
    for (const m of matches) {
      expect(m.lengthPt).toBeCloseTo(expectedPt, 2);
      expect(m.lengthMm).toBeCloseTo(80, 6);
    }
  });

  it('20mの辺に最も近い線分が 80.000mm である', async () => {
    const pdf = await buildStage0Pdf(fontBytes);
    const geom = await readPageGeometry(pdf);
    expect(closestSegmentLengthMm(geom, 80)).toBeCloseTo(80, 6);
  });

  it('コンテンツストリームに拡大縮小の座標変換が入っていない', async () => {
    const pdf = await buildStage0Pdf(fontBytes);
    const geom = await readPageGeometry(pdf);
    // cm による拡大縮小が1つでもあれば縮尺が壊れうる
    expect(geom.nonIdentityCtmCount).toBe(0);
  });

  it('A4の図郭が 262×180mm で描かれている（左綴じ代20mm）', async () => {
    const pdf = await buildStage0Pdf(fontBytes);
    const geom = await readPageGeometry(pdf);
    expect(countSegmentsOfLength(geom, 262, 0.001)).toBeGreaterThanOrEqual(2);
    expect(countSegmentsOfLength(geom, 180, 0.001)).toBeGreaterThanOrEqual(2);
  });

  it('縮尺分母を変えると辺の長さが比例して変わる', async () => {
    const pdf = await buildStage0Pdf(fontBytes, { scaleDenominator: 500 });
    const geom = await readPageGeometry(pdf);
    // 1/500 なら 20m は 40mm
    expect(closestSegmentLengthMm(geom, 40)).toBeCloseTo(40, 6);
  });
});

describe('日本語フォントの埋め込み', () => {
  it('サブセット化されており、出力が実体(6.1MB)より十分小さい', async () => {
    const pdf = await buildStage0Pdf(fontBytes);
    expect(pdf.length).toBeLessThan(300_000);
    expect(pdf.length).toBeGreaterThan(1_000);
  });

  it('CIDフォントとして字形が埋め込まれている', async () => {
    const pdf = await buildStage0Pdf(fontBytes);
    const fonts = await readEmbeddedFonts(pdf);
    expect(fonts.length).toBeGreaterThanOrEqual(1);
    const f = fonts[0];
    expect(f.isCidFont).toBe(true);
    expect(f.baseFont).toMatch(/IPAexGothic/);
    // 字形データが実際に入っている
    expect(f.fontFileBytes).toBeGreaterThan(1_000);
    // かつ元の実体(6,099,900バイト)よりはるかに小さい = サブセット化されている
    expect(f.fontFileBytes).toBeLessThan(fontBytes.length / 10);
  });

  it('任意の漢字を追加しても描画が通る（事前サブセットが効かないことの確認）', async () => {
    const pdf = await buildStage0Pdf(fontBytes, {
      titleBlockRows: [
        { label: '会社名', value: '株式会社鴻巣機械製作所' },
        { label: '所有者', value: '田中辰弘' },
        { label: '作成日', value: '令和8年7月29日' },
      ],
    });
    const doc = await PDFDocument.load(pdf);
    expect(doc.getPageCount()).toBe(1);
    expect(pdf.length).toBeGreaterThan(1_000);
  });
});

describe('検証用PDF', () => {
  it('100mm と 200mm の基準線が入っている', async () => {
    const pdf = await buildCalibrationPdf(fontBytes);
    const geom = await readPageGeometry(pdf);
    expect(countSegmentsOfLength(geom, 100, 0.001)).toBeGreaterThanOrEqual(1);
    expect(countSegmentsOfLength(geom, 200, 0.001)).toBeGreaterThanOrEqual(1);
    expect(countSegmentsOfLength(geom, 80, 0.001)).toBeGreaterThanOrEqual(1);
  });

  it('既定の用紙寸法はA4横', async () => {
    const pdf = await buildCalibrationPdf(fontBytes);
    const geom = await readPageGeometry(pdf);
    expect(geom.widthMm).toBeCloseTo(297, 6);
    expect(geom.heightMm).toBeCloseTo(210, 6);
  });

  it('印刷指示の用紙名が実際の用紙と一致する（A3固定の埋め込みを防ぐ）', async () => {
    for (const paper of [PAPER_SIZES.A4, PAPER_SIZES.A3]) {
      const pdf = await buildCalibrationPdf(fontBytes, paper);
      const doc = await PDFDocument.load(pdf);
      expect(doc.getPageCount()).toBe(1);
      const geom = await readPageGeometry(pdf);
      // 用紙名が正しければ用紙寸法も一致するはず
      expect(geom.widthMm).toBeCloseTo(paper.widthMm, 6);
    }
    // 文言そのものは描画テキストなので、生成に使った用紙名を直接確認する
    const { buildCalibrationNote } = await import('./stage0');
    expect(buildCalibrationNote(PAPER_SIZES.A4)[0]).toContain('A4で印刷');
    expect(buildCalibrationNote(PAPER_SIZES.A3)[0]).toContain('A3で印刷');
  });

  it('200mmの基準線がA4の図郭(262mm)に収まっている', async () => {
    const pdf = await buildCalibrationPdf(fontBytes);
    const geom = await readPageGeometry(pdf);
    const bar = geom.segments.find((s) => Math.abs(s.lengthMm - 200) < 0.001)!;
    expect(bar).toBeDefined();
    // 図郭は x=20mm から x=282mm
    const rightEndMm = Math.max(bar.x1, bar.x2) / mmToPt(1);
    expect(rightEndMm).toBeLessThanOrEqual(282);
  });
});
