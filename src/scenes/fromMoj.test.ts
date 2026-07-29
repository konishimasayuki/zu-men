import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadMojGeoJson, parcelAt, roughCentroid } from '../data/moj';
import fixture from '../data/__fixtures__/moj_kounosu_sample.json';
import { buildSceneFromMoj, nearestParcel, paperRotationFor } from './fromMoj';
import { pointInPolygon } from '../draw/layout';
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

  it('申請地の外周にフェンスが回る（進入口で切れる）', () => {
    const r = buildSceneFromMoj({
      parcels, subjects: [{ id: subject.id }], zone: ZONE, center,
      paper: PAPER_SIZES.A4, scaleDenominator: 250,
    });
    // 外周1本＋隅切り2本
    expect(r.scene.edgings.filter((e) => e.kind === 'fence')).toHaveLength(3);
  });

  it('進入口を作らなければフェンスは閉じた1本', () => {
    const r = buildSceneFromMoj({
      parcels, subjects: [{ id: subject.id }], zone: ZONE, center,
      paper: PAPER_SIZES.A4, scaleDenominator: 250, entrance: false, drainage: false,
    });
    const fences = r.scene.edgings.filter((e) => e.kind === 'fence');
    expect(fences).toHaveLength(1);
    const path = fences[0].path;
    expect(path[0]).toEqual(path[path.length - 1]);
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

describe('実データの筆への駐車区画の割り付け', () => {
  /** 抜粋の中でいちばん広い、駐車場にできる形の筆。 */
  const wide = parcels.find((p) => p.chiban === '327')!;
  const outline = () => wide.outline.map((q) => toPlaneXY(q, ZONE));
  const center = () => toPlaneXY(roughCentroid(wide.outline), ZONE);

  function build(parking?: false | { oneWay?: boolean }) {
    return buildSceneFromMoj({
      parcels, subjects: [{ id: wide.id, chimoku: '田' }], zone: ZONE, center: center(),
      paper: PAPER_SIZES.A4, scaleDenominator: 250,
      ...(parking === undefined ? {} : { parking }),
    });
  }

  it('申請地に区画が入り、台数が返る', () => {
    const r = build();
    expect(r.stallCount).toBeGreaterThan(0);
    expect(r.scene.bands.length).toBeGreaterThan(0);
    expect(r.scene.bands.reduce((s, b) => s + b.stalls.length, 0)).toBe(r.stallCount);
  });

  it('マスはすべて申請地の筆の内側に入る', () => {
    const r = build();
    const poly = outline();
    for (const b of r.scene.bands) {
      for (const s of b.stalls) {
        expect(pointInPolygon(poly, s.center)).toBe(true);
      }
    }
  });

  it('マスの総面積が敷地面積を超えない', () => {
    const r = build();
    const stallArea = r.stallCount * 2.5 * 5.0;
    expect(stallArea).toBeLessThan(area(outline()));
  });

  it('「通路」の注記が車路のぶんだけ入る', () => {
    const r = build();
    const tsuuro = r.scene.notes.filter((n) => n.text === '通路');
    expect(tsuuro.length).toBeGreaterThan(0);
    // 文字が逆さにならない範囲に畳まれている
    for (const n of tsuuro) {
      expect(n.rotationDeg!).toBeGreaterThan(-90);
      expect(n.rotationDeg!).toBeLessThanOrEqual(90);
    }
  });

  it('parking:false で区画を描かない', () => {
    const r = build(false);
    expect(r.stallCount).toBe(0);
    expect(r.scene.bands).toHaveLength(0);
    expect(r.scene.notes.filter((n) => n.text === '通路')).toHaveLength(0);
    // 筆界とフェンスは残る
    expect(r.scene.parcels.length).toBeGreaterThan(0);
    expect(r.scene.edgings.length).toBeGreaterThan(0);
  });

  it('一方通行にすると車路が細くなるぶん台数が減らない', () => {
    expect(build({ oneWay: true }).stallCount).toBeGreaterThanOrEqual(build().stallCount);
  });

  it('区画を入れても図郭に収まる', () => {
    const r = build();
    const fit = checkFit(r.scene, PAPER_SIZES.A4, 250);
    expect(fit.fits).toBe(true);
  });
});

describe('paperRotationFor', () => {
  it('真東の車路は紙の上で水平', () => {
    expect(paperRotationFor(90)).toBeCloseTo(0, 9);
  });

  it('真北の車路は紙の上で垂直', () => {
    expect(paperRotationFor(0)).toBeCloseTo(90, 9);
  });

  it('文字が逆さになる向きは畳む', () => {
    for (let b = 0; b < 360; b += 7) {
      const r = paperRotationFor(b);
      expect(r).toBeGreaterThan(-90);
      expect(r).toBeLessThanOrEqual(90);
    }
  });
});
