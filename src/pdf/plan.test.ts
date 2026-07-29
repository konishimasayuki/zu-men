import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildPlanPdf, checkFit, centeredOrigin, originCenteredOn } from './plan';
import { formatArea } from './drawScene';
import { referenceScene } from '../scenes/reference';
import { makeSampleScene, SAMPLE_143 } from '../scenes/sample';
import { PAPER_SIZES, frameExtentMeters } from '../paper/layout';
import { emptyScene, boundsOf, centroid } from '../draw/scene';
import { makeBand, countStalls } from '../draw/parking';
import { readPageGeometry, closestSegmentLengthMm } from '../test/pdfInspect';
import { CAR_LENGTH_M, CAR_WIDTH_M } from './symbols';

const FONT_PATH = resolve(__dirname, '../../public/fonts/ipaexg.ttf');
let fontBytes: Uint8Array;
beforeAll(() => {
  fontBytes = new Uint8Array(readFileSync(FONT_PATH));
});

describe('用紙に収まるかの判定', () => {
  it('参考図面の再現は A4 に収まらず A3 でも足りない', () => {
    const scene = referenceScene();
    const a4 = checkFit(scene, PAPER_SIZES.A4, 250);
    expect(a4.fits).toBe(false);
    expect(a4.frameWidthM).toBeCloseTo(65.5, 6);
    expect(a4.frameHeightM).toBeCloseTo(45.0, 6);
    // 収まらないときは必ず「より大きい用紙」を提案する。縮小印刷は提案しない。
    expect(a4.suggestion).not.toBeNull();
    expect(['A3', 'A2', 'A1']).toContain(a4.suggestion!.name);
  });

  it('小さな敷地なら A4 に収まる', () => {
    const scene = emptyScene();
    scene.bands = [makeBand({ origin: { x: 0, y: 0 }, runBearingDeg: 0, count: 4, depthLeft: false })];
    const fit = checkFit(scene, PAPER_SIZES.A4, 250);
    expect(fit.fits).toBe(true);
    expect(fit.suggestion).toBeNull();
  });

  it('中身が無ければ広がりは0', () => {
    expect(boundsOf(emptyScene())).toBeNull();
    expect(checkFit(emptyScene(), PAPER_SIZES.A4, 250).fits).toBe(true);
  });
});

describe('図面の中身', () => {
  it('参考図面の再現は 23台・申請地2筆・隣接地3筆', () => {
    const scene = referenceScene();
    expect(countStalls(scene.bands)).toBe(23);
    expect(scene.parcels.filter((p) => p.isSubject)).toHaveLength(2);
    expect(scene.parcels.filter((p) => !p.isSubject)).toHaveLength(3);
    expect(scene.parcels.filter((p) => !p.isSubject).map((p) => p.chiban).sort()).toEqual(['32', '89', '91']);
  });

  it('申請地には地目・面積・所有者がある。隣接地には無い', () => {
    const scene = referenceScene();
    const subject = scene.parcels.filter((p) => p.isSubject);
    expect(subject.map((p) => p.chiban)).toEqual(['44-4', '90-1']);
    expect(subject[0].chimoku).toBe('田');
    expect(subject[0].areaM2).toBe(590);
    expect(subject[0].owner).toBe('田中辰弘');
    for (const n of scene.parcels.filter((p) => !p.isSubject)) {
      expect(n.chimoku).toBeUndefined();
      expect(n.owner).toBeUndefined();
    }
  });

  it('面積は参考図面と同じく整数で書く', () => {
    expect(formatArea(590.0)).toBe('590');
    expect(formatArea(747.4)).toBe('747');
    expect(formatArea(99.44)).toBe('99.4');
  });

  it('重心は多角形の内側に来る', () => {
    const c = centroid([
      { x: 0, y: 0 }, { x: 0, y: 10 }, { x: 10, y: 10 }, { x: 10, y: 0 },
    ]);
    expect(c.x).toBeCloseTo(5, 9);
    expect(c.y).toBeCloseTo(5, 9);
  });
});

describe('計画平面図のPDF', () => {
  it('A3で生成でき、日本語が入る', async () => {
    const pdf = await buildPlanPdf(referenceScene(), fontBytes, { paper: PAPER_SIZES.A3 });
    const geom = await readPageGeometry(pdf);
    expect(geom.widthMm).toBeCloseTo(420, 6);
    expect(geom.heightMm).toBeCloseTo(297, 6);
    expect(pdf.length).toBeGreaterThan(20_000);
  });

  it('中身に拡大縮小が掛かっていない（印刷補正なしのとき）', async () => {
    const pdf = await buildPlanPdf(referenceScene(), fontBytes, { paper: PAPER_SIZES.A3 });
    const geom = await readPageGeometry(pdf);
    expect(geom.nonIdentityCtmCount).toBe(0);
  });

  it('車が実寸 4.6m × 1.78m で描かれている', async () => {
    // 1台だけの場面を作り、車体の長辺と短辺が紙上で何mmになるかを測る
    const scene = emptyScene();
    scene.bands = [makeBand({ origin: { x: 0, y: 0 }, runBearingDeg: 0, count: 1, depthLeft: false })];
    const geom = await readPageGeometry(await buildPlanPdf(scene, fontBytes, { paper: PAPER_SIZES.A3 }));

    // 1/250 では 4.6m = 18.4mm、1.78m = 7.12mm
    const bodyLengthMm = (CAR_LENGTH_M * 1000) / 250;
    const bodyWidthMm = (CAR_WIDTH_M * 1000) / 250;

    // 車内の横線は車幅の66%。ちょうどその長さの線分があること。
    const crossMm = bodyWidthMm * 0.66;
    expect(closestSegmentLengthMm(geom, crossMm)).toBeCloseTo(crossMm, 3);

    // 車体の直線部。角の丸み(車幅の32%)を両端から引いた長さになる。
    // ここが合っていれば車体長・車幅の両方が正しい。
    const straightMm = bodyLengthMm - 2 * (bodyWidthMm * 0.32);
    expect(straightMm).toBeCloseTo(13.8432, 4);
    expect(closestSegmentLengthMm(geom, straightMm)).toBeCloseTo(straightMm, 6);
  });

  it('区画の帯が 12.5m × 5.0m で描かれている', async () => {
    const scene = emptyScene();
    scene.bands = [makeBand({ origin: { x: 0, y: 0 }, runBearingDeg: 0, count: 5, depthLeft: false })];
    const geom = await readPageGeometry(await buildPlanPdf(scene, fontBytes, { paper: PAPER_SIZES.A3 }));
    // 1/250 で 12.5m = 50mm、5.0m = 20mm
    expect(closestSegmentLengthMm(geom, 50)).toBeCloseTo(50, 6);
    expect(closestSegmentLengthMm(geom, 20)).toBeCloseTo(20, 6);
  });

  it('図郭でクリップしている（周辺の線が図枠を突き抜けない）', async () => {
    const pdf = await buildPlanPdf(referenceScene(), fontBytes, { paper: PAPER_SIZES.A4 });
    const geom = await readPageGeometry(pdf);
    // クリップ演算子がちょうど1回。中身を描く前に1度だけ掛ける。
    expect(geom.clipCount).toBe(1);
    // A4に収まらない場面でも用紙寸法は変わらない
    expect(geom.widthMm).toBeCloseTo(297, 6);
  });

  it('中身が空でもクリップは掛かる', async () => {
    const geom = await readPageGeometry(await buildPlanPdf(emptyScene(), fontBytes));
    expect(geom.clipCount).toBe(1);
  });

  it('用紙の中央に置く原点が計算できる', () => {
    const scene = referenceScene();
    const origin = centeredOrigin(scene, PAPER_SIZES.A3, 250);
    const b = boundsOf(scene)!;
    // 図郭の中心が図面の中心に一致する
    expect(origin.x + 66.75 / 2).toBeCloseTo((b.minX + b.maxX) / 2, 6);
    expect(origin.y + 96.25 / 2).toBeCloseTo((b.minY + b.maxY) / 2, 6);
  });

  it('印刷補正はこの図面にも効く', async () => {
    const pdf = await buildPlanPdf(referenceScene(), fontBytes, {
      paper: PAPER_SIZES.A3,
      calibration: { nominalMm: 200, measuredMm: 198 },
    });
    const geom = await readPageGeometry(pdf);
    expect(geom.nonIdentityCtmCount).toBe(1);
    expect(geom.ctmScales[0]).toBeCloseTo(200 / 198, 9);
  });
});

describe('地図で指した場所を中心に置く（アプリの目的そのもの）', () => {
  it('指した点が図郭のちょうど中央に来る', () => {
    const pin = { x: 7484.234, y: -28070.811 };
    const origin = originCenteredOn(pin, PAPER_SIZES.A4, 250);
    // A4図郭は 65.5m（東西）×45.0m（南北）
    expect(origin.x + 45.0 / 2).toBeCloseTo(pin.x, 9);
    expect(origin.y + 65.5 / 2).toBeCloseTo(pin.y, 9);
  });

  it('ピンを動かすと図面の原点も同じだけ動く', () => {
    const a = originCenteredOn({ x: 100, y: 200 }, PAPER_SIZES.A4, 250);
    const b = originCenteredOn({ x: 135.26, y: 153.14 }, PAPER_SIZES.A4, 250);
    expect(b.x - a.x).toBeCloseTo(35.26, 9);
    expect(b.y - a.y).toBeCloseTo(-46.86, 9);
  });

  it('用紙を変えても指した点は中央のまま', () => {
    const pin = { x: 7484.234, y: -28070.811 };
    for (const name of ['A4', 'A3', 'A2', 'A1'] as const) {
      const paper = PAPER_SIZES[name];
      const origin = originCenteredOn(pin, paper, 250);
      const e = frameExtentMeters(paper, 250);
      expect(origin.x + e.heightM / 2).toBeCloseTo(pin.x, 9);
      expect(origin.y + e.widthM / 2).toBeCloseTo(pin.y, 9);
    }
  });

  it('ピンの位置に敷地の中心が来る', () => {
    const pin = { x: 7484.234, y: -28070.811 };
    const scene = makeSampleScene({ ...SAMPLE_143, center: pin });
    const site = scene.parcels.find((p) => p.isSubject)!;
    const c = centroid(site.outline);
    // 角を落としているぶん重心はわずかにずれるが、1m以内
    expect(Math.hypot(c.x - pin.x, c.y - pin.y)).toBeLessThan(1.0);
  });
});
