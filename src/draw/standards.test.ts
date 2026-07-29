import { describe, it, expect } from 'vitest';
import {
  JIS_Z8311, JIS_Z8312_WIDTHS_MM, SURVEY_LINE_WIDTHS_MM, SURVEY_LINE_TOLERANCE_MM,
  NOUCHI_DRAWINGS, isLayoutPlanScaleRecommended, PARKING_STANDARDS, isAisleWidthValid,
} from './standards';
import { LW } from '../pdf/pen';
import { LINE_WIDTH_MM } from '../pdf/frame';
import { MARGIN_MM } from '../paper/layout';
import { DEFAULT_SCALE_DENOMINATOR } from '../paper/transform';

describe('JIS Z 8311 図面の様式', () => {
  it('とじしろは最小20mm。実装の左余白がこれを満たす', () => {
    expect(JIS_Z8311.bindingMarginMm).toBe(20);
    expect(MARGIN_MM.left).toBeGreaterThanOrEqual(JIS_Z8311.bindingMarginMm);
  });

  it('とじしろは表題欄から最も離れた左端に置く。左が他の三辺より広い', () => {
    expect(MARGIN_MM.left).toBeGreaterThan(MARGIN_MM.right);
    expect(MARGIN_MM.left).toBeGreaterThan(MARGIN_MM.top);
    expect(MARGIN_MM.left).toBeGreaterThan(MARGIN_MM.bottom);
  });

  it('輪郭線は最小0.5mm。図枠の外線がこれを満たす', () => {
    expect(LINE_WIDTH_MM.frameOuter).toBeGreaterThanOrEqual(JIS_Z8311.frameLineMinMm);
    expect(LW.frameOuter).toBeGreaterThanOrEqual(JIS_Z8311.frameLineMinMm);
  });

  it('中心マークは最小0.5mm', () => {
    expect(LINE_WIDTH_MM.centerMark).toBeGreaterThanOrEqual(JIS_Z8311.centerMark.lineMm);
  });
});

describe('線の太さが規格の数列に載っている', () => {
  const surveyWidths = Object.values(SURVEY_LINE_WIDTHS_MM);

  it('公共測量標準図式 第7条の線号は 0.05〜0.50mm の9段階', () => {
    expect(surveyWidths).toEqual([0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.5]);
    expect(SURVEY_LINE_TOLERANCE_MM).toBe(0.025);
  });

  it.each(Object.entries(LW))('地物の線幅 %s = %s mm が線号のいずれかに一致する', (_name, width) => {
    expect(surveyWidths).toContain(width);
  });

  it.each(Object.entries(LINE_WIDTH_MM))('図枠の線幅 %s = %s mm が線号のいずれかに一致する', (_name, width) => {
    expect(surveyWidths).toContain(width);
  });

  it('JIS Z 8312 の数列も公比√2で定義どおり', () => {
    expect(JIS_Z8312_WIDTHS_MM).toEqual([0.13, 0.18, 0.25, 0.35, 0.5, 0.7, 1.0, 1.4, 2.0]);
    for (let i = 1; i < JIS_Z8312_WIDTHS_MM.length; i++) {
      const ratio = JIS_Z8312_WIDTHS_MM[i] / JIS_Z8312_WIDTHS_MM[i - 1];
      expect(ratio).toBeGreaterThan(1.3);
      expect(ratio).toBeLessThan(1.6);
    }
  });

  it('申請地の筆界は隣接筆より太い（主対象を目立たせる）', () => {
    expect(LW.siteBoundary).toBeGreaterThan(LW.parcelBoundary);
  });
});

describe('農地法関係事務処理要領 添付図面', () => {
  it('計画平面図の推奨縮尺は 1/500〜1/2,000', () => {
    expect(NOUCHI_DRAWINGS.layoutPlan.scaleMin).toBe(500);
    expect(NOUCHI_DRAWINGS.layoutPlan.scaleMax).toBe(2000);
    expect(isLayoutPlanScaleRecommended(500)).toBe(true);
    expect(isLayoutPlanScaleRecommended(1000)).toBe(true);
    expect(isLayoutPlanScaleRecommended(2000)).toBe(true);
  });

  it('位置図の縮尺は 1/10,000〜1/50,000', () => {
    expect(NOUCHI_DRAWINGS.locationMap.scaleMin).toBe(10_000);
    expect(NOUCHI_DRAWINGS.locationMap.scaleMax).toBe(50_000);
  });

  it('既定の1/250は推奨範囲より詳細側にある', () => {
    expect(DEFAULT_SCALE_DENOMINATOR).toBe(250);
    expect(isLayoutPlanScaleRecommended(DEFAULT_SCALE_DENOMINATOR)).toBe(false);
    expect(DEFAULT_SCALE_DENOMINATOR).toBeLessThan(NOUCHI_DRAWINGS.layoutPlan.scaleMin);
  });

  it('「施設物間の距離」の表示が求められている', () => {
    expect(NOUCHI_DRAWINGS.layoutPlan.requiresDistances).toBe(true);
  });
});

describe('駐車場法施行令第7条', () => {
  it('駐車マスは 2.5m × 5.0m', () => {
    expect(PARKING_STANDARDS.stall.widthM).toBe(2.5);
    expect(PARKING_STANDARDS.stall.depthM).toBe(5.0);
  });

  it('車路は対面5.5m以上・一方通行3.5m以上', () => {
    expect(isAisleWidthValid(5.5, false)).toBe(true);
    expect(isAisleWidthValid(5.49, false)).toBe(false);
    expect(isAisleWidthValid(3.5, true)).toBe(true);
    expect(isAisleWidthValid(3.49, true)).toBe(false);
  });
});
