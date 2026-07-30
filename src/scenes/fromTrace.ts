/**
 * 地図上をクリックして描いた概形から計画平面図を組み立てる。
 *
 * 登記所備付地図に筆が無い区域のためのフォールバック（CLAUDE.md 第1段階）。
 * 大川市の実データで確かめたところ、公開されているGeoJSONは市域の38〜53%しか
 * 覆っておらず、2022〜2025年のどの年次でも対象地の区画が入っていなかった。
 * こういう場所では図面が作れないので、外形を手で描く道を残す。
 *
 * **重大な注意。クリック座標は測量成果ではない。**
 * 地理院タイルを目視でなぞった値であり、数mの誤差を含む。
 * ここで得た面積を申請書の面積として使ってはならない。図面に記入する面積は
 * 登記簿または地積測量図の値を `registeredAreaM2` で渡す。
 */

import type { PlaneXY } from '../paper/transform';
import type { Parcel, Scene } from '../draw/scene';
import { emptyScene } from '../draw/scene';
import type { ParkingLayoutOptions } from '../draw/layout';
import { pointInPolygon } from '../draw/layout';
import type { DrainageOptions, EntranceOptions, NeighbourPolygon, SiteEdge } from '../draw/site';
import { decorateSubject } from './decorate';
import { toPlaneXY } from '../geo/crs';
import type { LonLat, ZoneNumber } from '../geo/crs';
import { area, perimeter } from '../geo/area';
import { MojParcel } from '../data/moj';
import { frameExtentMeters, PaperSize } from '../paper/layout';

/** 概形として成立する最小の頂点数。 */
export const MIN_TRACE_POINTS = 3;

export interface BuildFromTraceOptions {
  /** 地図上でクリックした点の並び。3点以上。閉じる必要はない。 */
  trace: readonly LonLat[];
  /** 系番号。 */
  zone: ZoneNumber;
  /** 図面の中心（ピンの位置）。 */
  center: PlaneXY;
  paper: PaperSize;
  scaleDenominator: number;
  /** 地番。登記事項証明書から。 */
  chiban?: string;
  /** 地目。 */
  chimoku?: string;
  /** 所有者名。 */
  owner?: string;
  /**
   * 図面に記入する面積[㎡]。**登記簿または地積測量図の値を渡すこと。**
   * 省略するとクリック座標から座標法で計算した値を使うが、それは測量成果ではない。
   */
  registeredAreaM2?: number;
  /** 周辺の描画に使う登記所備付地図の筆。無くてもよい。 */
  neighbours?: readonly MojParcel[];
  /** 図郭からさらに外側へ何メートル拾うか。 */
  marginM?: number;
  parking?: false | ParkingLayoutOptions;
  entranceEdgeIndex?: number;
  entrance?: false | EntranceOptions;
  dischargeEdgeIndex?: number;
  drainage?: false | DrainageOptions;
}

export interface BuildFromTraceResult {
  scene: Scene;
  /** 申請地の外形（平面直角座標）。 */
  outline: PlaneXY[];
  /** クリック座標から座標法で求めた面積[㎡]。**測量成果ではない。** */
  tracedAreaM2: number;
  /** クリック座標から求めた外周長[m]。 */
  tracedPerimeterM: number;
  /** 図面に記入した面積[㎡]。 */
  drawnAreaM2: number;
  /**
   * 記入した面積とクリック座標の面積の差の割合。
   * 大きければクリックの位置がずれているか、渡した面積が違う。
   * 省略時は0。
   */
  areaGapRatio: number;
  /** 周辺として描いた筆。 */
  neighbours: MojParcel[];
  stallCount: number;
  edges: SiteEdge[];
  entranceEdgeIndex: number | null;
  dischargeEdgeIndex: number | null;
}

export class TraceTooShortError extends Error {
  constructor(count: number) {
    super(`概形を作るには${MIN_TRACE_POINTS}点以上必要です（現在${count}点）。`);
    this.name = 'TraceTooShortError';
  }
}

export function buildSceneFromTrace(opts: BuildFromTraceOptions): BuildFromTraceResult {
  const { trace, zone, center, paper, scaleDenominator } = opts;
  if (trace.length < MIN_TRACE_POINTS) throw new TraceTooShortError(trace.length);

  const outline = dedupe(trace.map((p) => toPlaneXY(p, zone)));
  if (outline.length < MIN_TRACE_POINTS) throw new TraceTooShortError(outline.length);

  const tracedAreaM2 = area(outline);
  const drawnAreaM2 = opts.registeredAreaM2 ?? tracedAreaM2;
  const areaGapRatio =
    opts.registeredAreaM2 === undefined || tracedAreaM2 === 0
      ? 0
      : (drawnAreaM2 - tracedAreaM2) / tracedAreaM2;

  const scene = emptyScene();

  // 周辺の筆。申請地と重なるものは落とす。手で描いた外形と公図由来の筆が
  // 重なって二重に線が出るのを防ぐ。
  const marginM = opts.marginM ?? 20;
  const e = frameExtentMeters(paper, scaleDenominator);
  const halfEast = e.widthM / 2 + marginM;
  const halfNorth = e.heightM / 2 + marginM;
  const neighbours: MojParcel[] = [];
  for (const p of opts.neighbours ?? []) {
    const poly = p.outline.map((q) => toPlaneXY(q, zone));
    const inFrame = poly.some(
      (q) => Math.abs(q.y - center.y) <= halfEast && Math.abs(q.x - center.x) <= halfNorth,
    );
    if (!inFrame) continue;
    // 申請地の内側に重心が来る筆は、なぞった外形と同じものを指している可能性が高い
    if (pointInPolygon(outline, midpointOf(poly))) continue;
    neighbours.push(p);
    scene.parcels.push({ chiban: p.chiban, isSubject: false, outline: poly } satisfies Parcel);
  }

  const subject: Parcel = {
    chiban: opts.chiban?.trim() || '（地番未入力）',
    isSubject: true,
    chimoku: opts.chimoku,
    areaM2: drawnAreaM2,
    owner: opts.owner,
    outline,
  };
  scene.parcels.push(subject);

  const neighbourPolys: NeighbourPolygon[] = neighbours.map((p) => ({
    chiban: p.chiban,
    outline: p.outline.map((q) => toPlaneXY(q, zone)),
  }));

  const r = decorateSubject(scene, outline, neighbourPolys, subject, {
    parking: opts.parking,
    entranceEdgeIndex: opts.entranceEdgeIndex,
    entrance: opts.entrance,
    dischargeEdgeIndex: opts.dischargeEdgeIndex,
    drainage: opts.drainage,
  });

  return {
    scene,
    outline,
    tracedAreaM2,
    tracedPerimeterM: perimeter(outline),
    drawnAreaM2,
    areaGapRatio,
    neighbours,
    stallCount: r.stallCount,
    edges: r.edges,
    entranceEdgeIndex: r.entranceEdgeIndex,
    dischargeEdgeIndex: r.dischargeEdgeIndex,
  };
}

/** 同じ位置を続けてクリックした場合の重複を落とす。閉じるための最後の重複も落とす。 */
function dedupe(points: readonly PlaneXY[], epsM = 0.05): PlaneXY[] {
  const out: PlaneXY[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last && Math.hypot(p.x - last.x, p.y - last.y) < epsM) continue;
    out.push(p);
  }
  while (out.length > 1) {
    const first = out[0];
    const last = out[out.length - 1];
    if (Math.hypot(first.x - last.x, first.y - last.y) >= epsM) break;
    out.pop();
  }
  return out;
}

/** 頂点の平均。重心の代わりの粗い代表点。 */
function midpointOf(points: readonly PlaneXY[]): PlaneXY {
  return {
    x: points.reduce((s, p) => s + p.x, 0) / points.length,
    y: points.reduce((s, p) => s + p.y, 0) / points.length,
  };
}
