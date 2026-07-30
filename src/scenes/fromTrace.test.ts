import { describe, expect, it, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildSceneFromTrace, MIN_TRACE_POINTS, TraceTooShortError } from './fromTrace';
import { toLonLat, toPlaneXY } from '../geo/crs';
import type { LonLat } from '../geo/crs';
import { PAPER_SIZES } from '../paper/layout';
import { buildPlanPdf, originCenteredOn } from '../pdf/plan';
import { readPageGeometry } from '../test/pdfInspect';
import { area } from '../geo/area';
import { pointInPolygon } from '../draw/layout';
import { tsuboToM2 } from '../draw/tsubo';

const ZONE = 2 as const;
/** 依頼者から受けた座標（福岡県大川市大字下林）。 */
const PIN: LonLat = { lon: 130.4150011, lat: 33.2279338 };

/** ピンを中心に、一辺 sideM の正方形を緯度経度でなぞったことにする。 */
function squareTrace(sideM: number, pin: LonLat = PIN): LonLat[] {
  const c = toPlaneXY(pin, ZONE);
  const h = sideM / 2;
  return [
    { x: c.x - h, y: c.y - h },
    { x: c.x - h, y: c.y + h },
    { x: c.x + h, y: c.y + h },
    { x: c.x + h, y: c.y - h },
  ].map((p) => toLonLat(p, ZONE));
}

const base = {
  zone: ZONE,
  center: toPlaneXY(PIN, ZONE),
  paper: PAPER_SIZES.A4,
  scaleDenominator: 250,
};

let fontBytes: Uint8Array;
beforeAll(() => {
  fontBytes = new Uint8Array(readFileSync(resolve(__dirname, '../../public/fonts/ipaexg.ttf')));
});

describe('クリックした概形から図面を組み立てる', () => {
  it('点が足りなければ拒む', () => {
    for (const n of [0, 1, 2]) {
      expect(() => buildSceneFromTrace({ ...base, trace: squareTrace(20).slice(0, n) }))
        .toThrow(TraceTooShortError);
    }
    expect(MIN_TRACE_POINTS).toBe(3);
  });

  it('同じ点を続けてクリックしても壊れない', () => {
    const t = squareTrace(20);
    const dup = [t[0], t[0], t[1], t[1], t[2], t[3], t[0]];
    const r = buildSceneFromTrace({ ...base, trace: dup });
    expect(r.outline).toHaveLength(4);
  });

  it('20m四方をなぞると座標法で400㎡になる', () => {
    const r = buildSceneFromTrace({ ...base, trace: squareTrace(20) });
    expect(r.tracedAreaM2).toBeCloseTo(400, 1);
    expect(r.tracedPerimeterM).toBeCloseTo(80, 1);
  });

  it('図面に記入する面積は渡した登記簿面積が優先される', () => {
    const r = buildSceneFromTrace({
      ...base, trace: squareTrace(20), registeredAreaM2: 297.5,
    });
    expect(r.drawnAreaM2).toBe(297.5);
    const subject = r.scene.parcels.find((p) => p.isSubject)!;
    expect(subject.areaM2).toBe(297.5);
    // 形は変えない。図形の面積はなぞったまま。
    expect(area(subject.outline)).toBeCloseTo(400, 1);
  });

  it('面積の食い違いを割合で返す', () => {
    const r = buildSceneFromTrace({
      ...base, trace: squareTrace(20), registeredAreaM2: 500,
    });
    expect(r.areaGapRatio).toBeCloseTo(0.25, 6);
  });

  it('登記簿面積を渡さなければクリック座標の値を使う', () => {
    const r = buildSceneFromTrace({ ...base, trace: squareTrace(20) });
    expect(r.drawnAreaM2).toBeCloseTo(r.tracedAreaM2, 9);
    expect(r.areaGapRatio).toBe(0);
  });

  it('90坪をなぞると駐車区画・進入口・排水が載る', () => {
    // 90坪＝297.5㎡ は 17.25m四方
    const side = Math.sqrt(tsuboToM2(90));
    const r = buildSceneFromTrace({
      ...base, trace: squareTrace(side), registeredAreaM2: tsuboToM2(90),
      chiban: '505', chimoku: '田', owner: '田中辰弘',
    });
    expect(r.stallCount).toBeGreaterThan(0);
    expect(r.scene.bands.length).toBeGreaterThan(0);
    expect(r.entranceEdgeIndex).not.toBeNull();
    expect(r.dischargeEdgeIndex).not.toBeNull();
    expect(r.scene.notes.filter((n) => n.text === '進入口')).toHaveLength(1);
    expect(r.scene.notes.filter((n) => n.text === '雨水放流先')).toHaveLength(1);
    expect(r.scene.basins.length).toBeGreaterThan(0);
    expect(r.scene.edgings.some((e) => e.kind === 'gutter')).toBe(true);
    // 申請地の記載は4項目そろう
    const subject = r.scene.parcels.find((p) => p.isSubject)!;
    expect(subject.chiban).toBe('505');
    expect(subject.chimoku).toBe('田');
    expect(subject.owner).toBe('田中辰弘');
    expect(subject.areaM2).toBeCloseTo(297.52, 1);
  });

  it('マスは概形の内側に収まる', () => {
    const r = buildSceneFromTrace({ ...base, trace: squareTrace(30) });
    for (const b of r.scene.bands) {
      for (const s of b.stalls) {
        expect(pointInPolygon(r.outline, s.center)).toBe(true);
      }
    }
  });

  it('地番を渡さなければ未入力と書く', () => {
    const r = buildSceneFromTrace({ ...base, trace: squareTrace(20) });
    expect(r.scene.parcels.find((p) => p.isSubject)!.chiban).toBe('（地番未入力）');
  });

  it('進入口と放流先の辺を選べる', () => {
    const t = squareTrace(30);
    const a = buildSceneFromTrace({ ...base, trace: t, entranceEdgeIndex: 0 });
    const b = buildSceneFromTrace({ ...base, trace: t, entranceEdgeIndex: 2, dischargeEdgeIndex: 1 });
    expect(a.entranceEdgeIndex).toBe(0);
    expect(b.entranceEdgeIndex).toBe(2);
    expect(b.dischargeEdgeIndex).toBe(1);
  });

  it('周辺の筆が無くても図面になる', () => {
    const r = buildSceneFromTrace({ ...base, trace: squareTrace(25) });
    expect(r.neighbours).toHaveLength(0);
    expect(r.scene.parcels).toHaveLength(1);
  });

  it('A4・1/250のベクタPDFになり、ピンが中心に来る', async () => {
    const side = Math.sqrt(tsuboToM2(90));
    const r = buildSceneFromTrace({
      ...base, trace: squareTrace(side), registeredAreaM2: tsuboToM2(90), chiban: '505', chimoku: '田',
    });
    const pdf = await buildPlanPdf(r.scene, fontBytes, {
      paper: PAPER_SIZES.A4,
      scaleDenominator: 250,
      origin: originCenteredOn(base.center, PAPER_SIZES.A4, 250),
    });
    const geom = await readPageGeometry(pdf);
    expect(geom.widthMm).toBeCloseTo(297, 6);
    expect(geom.heightMm).toBeCloseTo(210, 6);
    // 印刷補正を掛けていないので拡大縮小は無い
    expect(geom.nonIdentityCtmCount).toBe(0);
    expect(geom.clipCount).toBe(1);
    expect(pdf.length).toBeGreaterThan(20_000);
  });

  it('なぞった辺長がPDF上で1/250になる', async () => {
    // 20m四方をなぞる。1辺は紙上80.0mm。
    const r = buildSceneFromTrace({ ...base, trace: squareTrace(20), parking: false, entrance: false, drainage: false });
    const pdf = await buildPlanPdf(r.scene, fontBytes, {
      paper: PAPER_SIZES.A4,
      scaleDenominator: 250,
      origin: originCenteredOn(base.center, PAPER_SIZES.A4, 250),
    });
    const geom = await readPageGeometry(pdf);
    // 80.0mm の線分が4本ある（申請地の外周）
    const eighty = geom.segments.filter((s) => Math.abs(s.lengthMm - 80) < 0.02);
    expect(eighty.length).toBeGreaterThanOrEqual(4);
  });
});
