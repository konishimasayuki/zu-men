/**
 * 図面の中身を紙に落とす。
 *
 * 平面直角座標[m] → 紙面[mm] の変換は paper/transform.ts の射影だけを使う。
 * ここで独自の拡大縮小をしてはならない。
 */

import { Pen, Pt2, LW } from './pen';
import { createProjector, metersToPaperMm, PlaneXY } from '../paper/transform';
import { area as polygonArea } from '../geo/area';
import {
  Scene, Parcel, Corridor, Building, Edging, StallBand, Note, centroid,
} from '../draw/scene';
import { drawCar, drawFence, drawRetainingWall, drawKeba, drawBasin, drawLeader } from './symbols';

export interface SceneLayout {
  /** 図郭左下に対応する平面直角座標。 */
  origin: PlaneXY;
  /** 図郭左下の紙面座標[mm]。 */
  frameOriginMm: Pt2;
  scaleDenominator: number;
}

/** 世界座標→紙面mm の変換をまとめたもの。 */
export function makeMapper(layout: SceneLayout) {
  const project = createProjector(layout.origin, layout.scaleDenominator);
  const toPaper = (p: PlaneXY): Pt2 => {
    const m = project(p);
    return { mmX: layout.frameOriginMm.mmX + m.mmX, mmY: layout.frameOriginMm.mmY + m.mmY };
  };
  const toMm = (meters: number) => metersToPaperMm(meters, layout.scaleDenominator);
  return { toPaper, toMm };
}

type Mapper = ReturnType<typeof makeMapper>;

/** 方位角[度]（真北から時計回り）を紙面の単位ベクトルへ。 */
function bearingToAxis(bearingDeg: number): { dx: number; dy: number } {
  const rad = (bearingDeg * Math.PI) / 180;
  // 北が紙面の上（+mmY）、東が右（+mmX）
  return { dx: Math.sin(rad), dy: Math.cos(rad) };
}

/** 中心線と幅から帯の両側の縁を作る。折れ点は単純なオフセットで近似する。 */
function offsetPath(points: readonly Pt2[], offsetMm: number): Pt2[] {
  const out: Pt2[] = [];
  for (let i = 0; i < points.length; i++) {
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    const dx = next.mmX - prev.mmX;
    const dy = next.mmY - prev.mmY;
    const len = Math.hypot(dx, dy) || 1;
    out.push({ mmX: points[i].mmX - (dy / len) * offsetMm, mmY: points[i].mmY + (dx / len) * offsetMm });
  }
  return out;
}

function drawCorridor(pen: Pen, m: Mapper, c: Corridor): void {
  const center = c.centerline.map(m.toPaper);
  const half = m.toMm(c.widthM / 2);
  const left = offsetPath(center, half);
  const right = offsetPath(center, -half);

  // 参考図面の市道は片側の縁だけに短い法面のケバが入る。両側に長く出すと
  // 梯子のようになって実物と違う。
  if (c.keba) {
    drawKeba(pen, left, false, false, 0.7, 2.6);
    pen.polyline(right, LW.corridor);
  } else {
    pen.polyline(left, LW.corridor);
    pen.polyline(right, LW.corridor);
  }
}

function drawParcelOutline(pen: Pen, m: Mapper, p: Parcel): void {
  pen.polyline(p.outline.map(m.toPaper), p.isSubject ? LW.siteBoundary : LW.parcelBoundary, true);
}

/** 面積の表記。参考図面は整数で書かれている。 */
export function formatArea(m2: number): string {
  return m2 >= 100 ? String(Math.round(m2)) : m2.toFixed(1);
}

function drawParcelLabel(pen: Pen, m: Mapper, p: Parcel): void {
  const at = m.toPaper(p.labelAt ?? centroid(p.outline));

  if (!p.isSubject) {
    // 隣接地は地番のみ
    pen.text(p.chiban, at, 3.0, { align: 'center' });
    return;
  }

  // 申請地は 地番 / 地目・面積 / 所有者 の3行
  const lines: string[] = [p.chiban];
  const areaText = formatArea(p.areaM2 ?? polygonArea(p.outline));
  lines.push(`${p.chimoku ?? ''}　${areaText}`.trim());
  if (p.owner) lines.push(p.owner);

  const size = 3.0;
  const gap = size * 1.35;
  lines.forEach((line, i) => {
    pen.text(line, { mmX: at.mmX, mmY: at.mmY - gap * i }, size, { align: 'center' });
  });
}

function drawBuilding(pen: Pen, m: Mapper, b: Building): void {
  drawKeba(pen, b.outline.map(m.toPaper), true, true);
}

function drawEdging(pen: Pen, m: Mapper, e: Edging): void {
  const path = e.path.map(m.toPaper);
  if (e.kind === 'fence') drawFence(pen, path);
  else drawRetainingWall(pen, path, e.outwardLeft ?? true);
}

function drawBand(pen: Pen, m: Mapper, band: StallBand): void {
  // 参考図面はマスの割り線を引かず、帯の外形だけを描いている
  pen.polyline(band.outline.map(m.toPaper), LW.stall, true);
  for (const s of band.stalls) {
    if (s.withCar === false) continue;
    drawCar(pen, m.toPaper(s.center), bearingToAxis(s.bearingDeg), m.toMm);
  }
}

function drawNote(pen: Pen, m: Mapper, n: Note): void {
  const at = m.toPaper(n.at);
  const size = n.sizeMm ?? 3.0;
  if (n.leaderTo) drawLeader(pen, m.toPaper(n.leaderTo), at, at);
  pen.text(n.text, at, size, { align: 'center', rotateDeg: n.rotationDeg });
}

/**
 * 図面の中身を描く。
 *
 * 描く順は、下から 道路・水路 → 建物 → 筆界 → 区画・車 → 縁の記号 → 注記。
 * 後から描いたものが上に載る。
 */
export function drawSceneContent(pen: Pen, scene: Scene, layout: SceneLayout): void {
  const m = makeMapper(layout);

  for (const c of scene.corridors) drawCorridor(pen, m, c);
  for (const b of scene.buildings) drawBuilding(pen, m, b);
  for (const p of scene.parcels) drawParcelOutline(pen, m, p);
  for (const b of scene.bands) drawBand(pen, m, b);
  for (const e of scene.edgings) drawEdging(pen, m, e);
  for (const p of scene.basins) drawBasin(pen, m.toPaper(p));

  // 文字はいちばん上
  for (const p of scene.parcels) drawParcelLabel(pen, m, p);
  for (const c of scene.corridors) {
    const at = c.labelAt ?? c.centerline[Math.floor(c.centerline.length / 2)];
    pen.text(c.name, m.toPaper(at), 3.0, { align: 'center' });
  }
  for (const n of scene.notes) drawNote(pen, m, n);
}
