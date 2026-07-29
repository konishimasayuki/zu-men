import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { makeSampleScene, SAMPLE_90, SAMPLE_143 } from './sample';
import { checkFit, buildPlanPdf } from '../pdf/plan';
import { PAPER_SIZES } from '../paper/layout';
import { countStalls, checkAisleWidth, DEFAULT_STALL } from '../draw/parking';
import { area } from '../geo/area';
import { tsuboToM2 } from '../draw/tsubo';
import { readPageGeometry } from '../test/pdfInspect';

let fontBytes: Uint8Array;
beforeAll(() => {
  fontBytes = new Uint8Array(readFileSync(resolve(__dirname, '../../public/fonts/ipaexg.ttf')));
});

describe('対象地の規模でA4・1/250が成立する', () => {
  it.each([
    ['90坪', SAMPLE_90],
    ['143坪', SAMPLE_143],
  ])('%s は周辺を含めてA4横・1/250に収まる', (_label, spec) => {
    const fit = checkFit(makeSampleScene(spec), PAPER_SIZES.A4, 250);
    expect(fit.fits).toBe(true);
    expect(fit.suggestion).toBeNull();
  });

  it('敷地の面積が指定の坪数とおおむね一致する（角落としのぶん少し小さい）', () => {
    for (const spec of [SAMPLE_90, SAMPLE_143]) {
      const site = makeSampleScene(spec).parcels.find((p) => p.isSubject)!;
      const target = tsuboToM2(spec.tsubo);
      const drawn = area(site.outline);
      expect(drawn).toBeLessThan(target);
      expect(drawn).toBeGreaterThan(target * 0.94);
    }
  });

  it('車路幅が駐車場法施行令の基準を満たす', () => {
    expect(checkAisleWidth(DEFAULT_STALL.aisleM, false).ok).toBe(true);
  });

  it('台数が坪数に見合う', () => {
    expect(countStalls(makeSampleScene(SAMPLE_90).bands)).toBe(12);
    expect(countStalls(makeSampleScene(SAMPLE_143).bands)).toBe(16);
  });

  it('周辺の要素がそろっている（市道・用悪水路・隣接3筆・隣家）', () => {
    const scene = makeSampleScene(SAMPLE_143);
    expect(scene.corridors.filter((c) => c.kind === 'road')).toHaveLength(1);
    expect(scene.corridors.filter((c) => c.kind === 'waterway')).toHaveLength(1);
    expect(scene.parcels.filter((p) => !p.isSubject)).toHaveLength(3);
    expect(scene.buildings.length).toBeGreaterThan(0);
    expect(scene.notes.some((n) => n.text === '進入口')).toBe(true);
  });

  it('A4・1/250でPDFが生成でき、用紙寸法が正しい', async () => {
    const pdf = await buildPlanPdf(makeSampleScene(SAMPLE_143), fontBytes, {
      paper: PAPER_SIZES.A4,
      scaleDenominator: 250,
    });
    const geom = await readPageGeometry(pdf);
    expect(geom.widthMm).toBeCloseTo(297, 6);
    expect(geom.heightMm).toBeCloseTo(210, 6);
    expect(geom.nonIdentityCtmCount).toBe(0);
    expect(geom.clipCount).toBe(1);
  });
});
