/**
 * 登記所備付地図の筆から計画平面図の中身を組み立てる。
 *
 * 「ピンを指した場所の計画平面図」の中身が、仮置きの矩形から実データに変わる。
 * 申請地は選んだ筆、周辺は図郭に入る範囲の隣接筆。
 *
 * このデータにあるのは筆界と地番だけ。**地目・面積・所有者は入っていない**ので、
 * 画面から受け取る。面積は座標法で計算した値を既定とし、上書きできる。
 */

import type { PlaneXY } from '../paper/transform';
import type { Scene, Parcel } from '../draw/scene';
import { emptyScene } from '../draw/scene';
import { labelSpot, layoutParking, ParkingLayoutOptions } from '../draw/layout';
import {
  boundaryEdges, defaultEntranceEdge, planDrainage, planEntrance,
  DrainageOptions, EntranceOptions, NeighbourPolygon, SiteEdge,
} from '../draw/site';
import { toPlaneXY } from '../geo/crs';
import type { ZoneNumber } from '../geo/crs';
import { area } from '../geo/area';
import { MojParcel, roughCentroid, roughDistanceM } from '../data/moj';
import { frameExtentMeters, PaperSize } from '../paper/layout';

/** 申請地の1筆に、データに無い情報を足したもの。 */
export interface SubjectParcelInput {
  /** 登記所備付地図の筆ID。 */
  id: string;
  /** 地目。登記事項証明書から。 */
  chimoku?: string;
  /** 面積[㎡]。省略すると座標法で計算した値を使う。 */
  areaM2?: number;
  /** 所有者名。登記事項証明書から。 */
  owner?: string;
}

export interface BuildFromMojOptions {
  /** 読み込んだ筆すべて。 */
  parcels: readonly MojParcel[];
  /** 申請地として選んだ筆。 */
  subjects: readonly SubjectParcelInput[];
  /** 系番号。 */
  zone: ZoneNumber;
  /** 図面の中心（ピンの位置）。 */
  center: PlaneXY;
  /** 用紙。周辺をどこまで拾うかの範囲決めに使う。 */
  paper: PaperSize;
  scaleDenominator: number;
  /** 図郭からさらに外側へ何メートル拾うか。少し余分に拾って端で切る。 */
  marginM?: number;
  /**
   * 駐車区画を割り付けるか。既定は割り付ける。
   * この図面は「駐車場に転用する計画」を示すものなので、区画が無いと図面にならない。
   */
  parking?: false | ParkingLayoutOptions;
  /**
   * 進入口を置く辺（申請地の外周の何番目か）。
   *
   * **どの辺が道路かはこのデータからは分からない。** 登記所備付地図に地目は無く、
   * 実データでは道路も水路も登記された筆として隣接している。省略した場合は
   * いちばん長い辺を初期選択とするが、それは推定ではない。画面で選び直させること。
   */
  entranceEdgeIndex?: number;
  /** 進入口・隅切りの寸法。 */
  entrance?: false | EntranceOptions;
  /**
   * 雨水の放流先の辺。省略すると進入口と同じ辺（道路側の側溝へ流す想定）。
   * 隣接農地の側を選ばないこと。舗装後の流入防止が審査上の最大の論点。
   */
  dischargeEdgeIndex?: number;
  /** 排水を描くか。既定は描く。 */
  drainage?: false | DrainageOptions;
}

export interface BuildFromMojResult {
  scene: Scene;
  /** 申請地として描いた筆。 */
  subjects: MojParcel[];
  /** 周辺として描いた筆。 */
  neighbours: MojParcel[];
  /** 申請地の座標法による面積[㎡]。地番順。 */
  computedAreas: { chiban: string; areaM2: number }[];
  /** 申請地の合計面積[㎡]。 */
  totalAreaM2: number;
  /**
   * 割り付けた駐車台数。
   * **図面には書かない**（参考図面に記載が無いため）。画面で確認するための値。
   */
  stallCount: number;
  /**
   * 申請地の外周の辺。画面で「どれが道路か」「どこへ放流するか」を選ばせるための一覧。
   * 申請地が複数筆のときは1筆目のもの。
   */
  edges: SiteEdge[];
  /** 実際に進入口を置いた辺の番号。置かなければ null。 */
  entranceEdgeIndex: number | null;
  /** 実際に放流先とした辺の番号。排水を描かなければ null。 */
  dischargeEdgeIndex: number | null;
}

/**
 * 図郭に入る範囲の筆だけを拾う。
 * 全市町村ぶん（鴻巣市なら19,420筆）を描くと重いし、図郭の外は見えない。
 */
function withinFrame(
  parcels: readonly MojParcel[],
  center: PlaneXY,
  zone: ZoneNumber,
  paper: PaperSize,
  scaleDenominator: number,
  marginM: number,
): MojParcel[] {
  const e = frameExtentMeters(paper, scaleDenominator);
  const halfEast = e.widthM / 2 + marginM;
  const halfNorth = e.heightM / 2 + marginM;
  return parcels.filter((p) => {
    // 1点でも図郭の範囲に入っていれば拾う
    for (const q of p.outline) {
      const xy = toPlaneXY(q, zone);
      if (Math.abs(xy.y - center.y) <= halfEast && Math.abs(xy.x - center.x) <= halfNorth) return true;
    }
    return false;
  });
}

export function buildSceneFromMoj(opts: BuildFromMojOptions): BuildFromMojResult {
  const { parcels, subjects, zone, center, paper, scaleDenominator } = opts;
  const marginM = opts.marginM ?? 20;

  const subjectIds = new Set(subjects.map((s) => s.id));
  const extras = new Map(subjects.map((s) => [s.id, s]));

  const inFrame = withinFrame(parcels, center, zone, paper, scaleDenominator, marginM);
  // 申請地は図郭の外に一部が出ていても必ず描く
  const chosen = parcels.filter((p) => subjectIds.has(p.id));
  const seen = new Set(inFrame.map((p) => p.id));
  for (const p of chosen) if (!seen.has(p.id)) inFrame.push(p);

  const scene = emptyScene();
  const subjectParcels: MojParcel[] = [];
  const neighbourParcels: MojParcel[] = [];
  const computedAreas: { chiban: string; areaM2: number }[] = [];

  for (const p of inFrame) {
    const outline = p.outline.map((q) => toPlaneXY(q, zone));
    const isSubject = subjectIds.has(p.id);

    if (isSubject) {
      const extra = extras.get(p.id)!;
      const computed = area(outline);
      computedAreas.push({ chiban: p.chiban, areaM2: computed });
      subjectParcels.push(p);
      scene.parcels.push({
        chiban: p.chiban,
        isSubject: true,
        chimoku: extra.chimoku,
        areaM2: extra.areaM2 ?? computed,
        owner: extra.owner,
        outline,
      } satisfies Parcel);
    } else {
      neighbourParcels.push(p);
      scene.parcels.push({ chiban: p.chiban, isSubject: false, outline } satisfies Parcel);
    }
  }

  // 進入口・排水は申請地の1筆目の外周を基準にする。
  // 複数筆を1つの敷地として扱う統合はまだ実装していない。
  const primary = subjectParcels[0]
    ? subjectParcels[0].outline.map((q) => toPlaneXY(q, zone))
    : null;
  const neighbourPolys: NeighbourPolygon[] = neighbourParcels.map((p) => ({
    chiban: p.chiban,
    outline: p.outline.map((q) => toPlaneXY(q, zone)),
  }));
  const edges = primary ? boundaryEdges(primary, neighbourPolys) : [];

  let entranceEdgeIndex: number | null = null;
  let dischargeEdgeIndex: number | null = null;

  // 申請地の外周にフェンスを回し、内側に駐車区画を割り付ける
  let stallCount = 0;
  for (const p of subjectParcels) {
    const outline = p.outline.map((q) => toPlaneXY(q, zone));
    const isPrimary = p === subjectParcels[0];

    const layout = opts.parking === false ? null : layoutParking(outline, opts.parking ?? {});
    if (layout) {
      scene.bands.push(...layout.bands);
      stallCount += layout.count;
      // 参考図面は区画のあいだに「通路」と書いている。台数は書かない。
      for (const at of layout.aisleCenters) {
        scene.notes.push({ text: '通路', at, rotationDeg: paperRotationFor(layout.bearingDeg) });
      }
    }

    // 進入口。フェンスは開口部で切る。切らないと車の入れない図面になる。
    const entranceEdge =
      isPrimary && opts.entrance !== false
        ? pickEdge(edges, opts.entranceEdgeIndex) ?? defaultEntranceEdge(edges)
        : null;
    if (entranceEdge) {
      const plan = planEntrance(outline, entranceEdge, opts.entrance || {});
      entranceEdgeIndex = entranceEdge.index;
      for (const path of plan.fencePaths) scene.edgings.push({ kind: 'fence', path });
      for (const [a, b] of plan.cornerCuts) scene.edgings.push({ kind: 'fence', path: [a, b] });
      // 参考図面の進入口は引出し線で示されている。矢印記号は入れない。
      scene.notes.push({
        text: '進入口',
        at: {
          x: plan.center.x + entranceEdge.outward.x * 3.5,
          y: plan.center.y + entranceEdge.outward.y * 3.5,
        },
        sizeMm: 2.6,
        leaderTo: plan.center,
      });
    } else {
      scene.edgings.push({ kind: 'fence', path: outline.concat([outline[0]]) });
    }

    // 排水。舗装で浸透しなくなるぶんを放流先へ導く。
    const dischargeEdge =
      isPrimary && opts.drainage !== false
        ? pickEdge(edges, opts.dischargeEdgeIndex) ?? entranceEdge
        : null;
    if (dischargeEdge) {
      const plan = planDrainage(layout?.bands ?? [], dischargeEdge, opts.drainage || {});
      dischargeEdgeIndex = dischargeEdge.index;
      if (plan.gutter) scene.edgings.push(plan.gutter);
      scene.basins.push(...plan.basins);
      scene.arrows.push(...plan.arrows);
      // 進入口の注記と重ならないよう、辺の中央ではなく1/5あたりの外側に置く
      const t = 0.2;
      const anchor = {
        x: dischargeEdge.a.x + (dischargeEdge.b.x - dischargeEdge.a.x) * t,
        y: dischargeEdge.a.y + (dischargeEdge.b.y - dischargeEdge.a.y) * t,
      };
      scene.notes.push({
        text: '雨水放流先',
        at: {
          x: anchor.x + dischargeEdge.outward.x * 3.0,
          y: anchor.y + dischargeEdge.outward.y * 3.0,
        },
        sizeMm: 2.6,
        leaderTo: anchor,
      });
    }

    // 地番・地目・面積・所有者は4行になる。区画に重なると読めないので空き地を探す。
    const label = scene.parcels.find((q) => q.isSubject && q.chiban === p.chiban);
    if (label) {
      label.labelAt = labelSpot(outline, layout ? layout.bands.map((b) => b.outline) : []);
    }
  }

  return {
    scene,
    subjects: subjectParcels,
    neighbours: neighbourParcels,
    computedAreas,
    totalAreaM2: computedAreas.reduce((s, a) => s + a.areaM2, 0),
    stallCount,
    edges,
    entranceEdgeIndex,
    dischargeEdgeIndex,
  };
}

/** 番号で辺を選ぶ。範囲外や未指定なら null。 */
function pickEdge(edges: readonly SiteEdge[], index: number | undefined): SiteEdge | null {
  if (index === undefined) return null;
  return edges.find((e) => e.index === index) ?? null;
}

/**
 * 方位角[度]（真北から時計回り）を、紙面での文字の回転角[度]（反時計回り）に直す。
 * 紙は北が上なので、真東(90度)が水平(0度)になる。文字が逆さにならないよう畳む。
 */
export function paperRotationFor(bearingDeg: number): number {
  let deg = 90 - bearingDeg;
  while (deg > 90) deg -= 180;
  while (deg <= -90) deg += 180;
  return deg;
}

/** ピンにいちばん近い筆を、図郭内から選ぶ。申請地の初期選択に使う。 */
export function nearestParcel(
  parcels: readonly MojParcel[],
  pin: { lon: number; lat: number },
): MojParcel | null {
  let best: MojParcel | null = null;
  let bestD = Infinity;
  for (const p of parcels) {
    const d = roughDistanceM(roughCentroid(p.outline), pin);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}
