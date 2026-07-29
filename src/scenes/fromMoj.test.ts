import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadMojGeoJson, parcelAt, roughCentroid } from '../data/moj';
import fixture from '../data/__fixtures__/moj_kounosu_sample.json';
import { buildSceneFromMoj, nearestParcel } from './fromMoj';
import { toPlaneXY } from '../geo/crs';
import { PAPER_SIZES } from '../paper/layout';
import { buildPlanPdf, originCenteredOn, checkFit } from '../pdf/plan';
import { readPageGeometry } from '../test/pdfInspect';
import { area } from '../geo/area';

const { parcels } = loadMojGeoJson(fixture);
const ZONE = 9 as const;
/** 抜粋の中心付近。ここにピンを立てたことにする。 */
const PIN = { lon: 139.472, lat: 36.09 };

let fontBytes: Uint8Array;
beforeAll(() => {
  fontBytes = new Uint8Array(readFileSync(resolve(__dirname, '../../public/fonts/ipaexg.ttf')));
});

describe('実データの筆から図面を組み立てる', () => {
  const subject = parcelAt(parcels, PIN) ?? nearestParcel(parcels, PIN)!;
  const center = toPlaneXY(roughCentroid(subject.outline), ZONE);

  it('ピンの位置から申請地の筆が選べる', () => {
    expect(subject).toBeTruthy();
    expect(subject.chiban).toMatch(/\d/);
    expect(subject.oaza).toBe('愛の町');
  });

  it('図郭に入る周辺の筆だけを拾う（全筆を描かない）', () => {
    const r = buildSceneFromMoj({
      parcels, subjects: [{ id: subject.id }], zone: ZONE, center,
      paper: PAPER_SIZES.A4, scaleDenominator: 250,
    });
    expect(r.subjects).toHaveLength(1);
    expect(r.neighbours.length).toBeGreaterThan(0);
    expect(r.neighbours.length).toBeLessThan(parcels.length);
    expect(r.scene.parcels.length).toBe(r.subjects.length + r.neighbours.length);
  });

  it('申請地の面積を座標法で計算する', () => {
    const r = buildSceneFromMoj({
      parcels, subjects: [{ id: subject.id }], zone: ZONE, center,
      paper: PAPER_SIZES.A4, scaleDenominator: 250,
    });
    expect(r.computedAreas).toHaveLength(1);
    expect(r.totalAreaM2).toBeGreaterThan(0);
    // 図面に入る面積は座標法の値
    const drawn = r.scene.parcels.find((p) => p.isSubject)!;
    expect(drawn.areaM2).toBeCloseTo(r.computedAreas[0].areaM2, 9);
    // 実際に多角形から計算した値と一致する
    expect(area(drawn.outline)).toBeCloseTo(r.computedAreas[0].areaM2, 6);
  });

  it('地目・所有者は外から渡す（データに入っていないため）', () => {
    const r = buildSceneFromMoj({
      parcels, subjects: [{ id: subject.id, chimoku: '田', owner: '田中辰弘', areaM2: 472.7 }],
      zone: ZONE, center, paper: PAPER_SIZES.A4, scaleDenominator: 250,
    });
    const drawn = r.scene.parcels.find((p) => p.isSubject)!;
    expect(drawn.chimoku).toBe('田');
    expect(drawn.owner).toBe('田中辰弘');
    // 指定した面積が座標法の値より優先される
    expect(drawn.areaM2).toBe(472.7);
  });

  it('複数の筆を申請地にできる', () => {
    const two = parcels.slice(0, 2);
    const r = buildSceneFromMoj({
      parcels, subjects: two.map((p) => ({ id: p.id })), zone: ZONE,
      center: toPlaneXY(roughCentroid(two[0].outline), ZONE),
      paper: PAPER_SIZES.A4, scaleDenominator: 250,
    });
    expect(r.subjects).toHaveLength(2);
    expect(r.computedAreas).toHaveLength(2);
    expect(r.totalAreaM2).toBeCloseTo(r.computedAreas.reduce((s, a) => s + a.areaM2, 0), 9);
  });

  it('申請地の外周にフェンスが回る', () => {
    const r = buildSceneFromMoj({
      parcels, subjects: [{ id: subject.id }], zone: ZONE, center,
      paper: PAPER_SIZES.A4, scaleDenominator: 250,
    });
    expect(r.scene.edgings.filter((e) => e.kind === 'fence')).toHaveLength(1);
  });

  it('隣接地には地目・面積・所有者を入れない', () => {
    const r = buildSceneFromMoj({
      parcels, subjects: [{ id: subject.id }], zone: ZONE, center,
      paper: PAPER_SIZES.A4, scaleDenominator: 250,
    });
    for (const n of r.scene.parcels.filter((p) => !p.isSubject)) {
      expect(n.chimoku).toBeUndefined();
      expect(n.owner).toBeUndefined();
      expect(n.areaM2).toBeUndefined();
    }
  });

  it('用紙が大きいほど拾う筆が増える', () => {
    const mk = (paper: typeof PAPER_SIZES.A4) =>
      buildSceneFromMoj({
        parcels, subjects: [{ id: subject.id }], zone: ZONE, center, paper, scaleDenominator: 250,
      }).neighbours.length;
    expect(mk(PAPER_SIZES.A3)).toBeGreaterThan(mk(PAPER_SIZES.A4));
  });
});

describe('実データからPDFを出す', () => {
  it('A4・1/250のPDFになり、ピンが中心に来る', async () => {
    const subject = nearestParcel(parcels, PIN)!;
    const center = toPlaneXY(roughCentroid(subject.outline), ZONE);
    const r = buildSceneFromMoj({
      parcels, subjects: [{ id: subject.id, chimoku: '田', owner: '田中辰弘' }],
      zone: ZONE, center, paper: PAPER_SIZES.A4, scaleDenominator: 250,
    });
    const pdf = await buildPlanPdf(r.scene, fontBytes, {
      paper: PAPER_SIZES.A4,
      scaleDenominator: 250,
      origin: originCenteredOn(center, PAPER_SIZES.A4, 250),
    });
    const geom = await readPageGeometry(pdf);
    expect(geom.widthMm).toBeCloseTo(297, 6);
    expect(geom.heightMm).toBeCloseTo(210, 6);
    expect(geom.nonIdentityCtmCount).toBe(0);
    expect(geom.clipCount).toBe(1);
    expect(pdf.length).toBeGreaterThan(20_000);
  });

  it('図郭に収まるかを判定できる', () => {
    const subject = nearestParcel(parcels, PIN)!;
    const center = toPlaneXY(roughCentroid(subject.outline), ZONE);
    const r = buildSceneFromMoj({
      parcels, subjects: [{ id: subject.id }], zone: ZONE, center,
      paper: PAPER_SIZES.A4, scaleDenominator: 250, marginM: 0,
    });
    const fit = checkFit(r.scene, PAPER_SIZES.A4, 250);
    expect(fit.frameWidthM).toBeCloseTo(65.5, 6);
    expect(fit.contentWidthM).toBeGreaterThan(0);
  });
});
