/**
 * 申請地の外形に、駐車区画・進入口・排水・ラベル位置を載せる。
 *
 * 外形の出どころは2つある。登記所備付地図の筆（`fromMoj.ts`）と、
 * データが無い区域で地図上をクリックして描いた概形（`fromTrace.ts`）。
 * **どちらも同じ図面になるべき**なので、載せる処理はここ1箇所に置く。
 */

import type { PlaneXY } from '../paper/transform';
import type { Parcel, Scene } from '../draw/scene';
import { labelSpot, layoutParking, ParkingLayoutOptions } from '../draw/layout';
import {
  boundaryEdges, defaultEntranceEdge, planDrainage, planEntrance,
  DrainageOptions, EntranceOptions, NeighbourPolygon, SiteEdge,
} from '../draw/site';

export interface DecorateOptions {
  /**
   * 駐車区画を割り付けるか。既定は割り付ける。
   * この図面は「駐車場に転用する計画」を示すものなので、区画が無いと図面にならない。
   */
  parking?: false | ParkingLayoutOptions;
  /**
   * 進入口を置く辺（外周の何番目か）。
   *
   * **どの辺が道路かはデータからは分からない。** 省略した場合はいちばん長い辺を
   * 初期選択とするが、それは推定ではない。画面で選び直させること。
   */
  entranceEdgeIndex?: number;
  /** 進入口・隅切りの寸法。false で進入口を作らず、フェンスを閉じた1本にする。 */
  entrance?: false | EntranceOptions;
  /**
   * 雨水の放流先の辺。省略すると進入口と同じ辺（道路側の側溝へ流す想定）。
   * 隣接農地の側を選ばないこと。舗装後の流入防止が審査上の最大の論点。
   */
  dischargeEdgeIndex?: number;
  /** 排水を描くか。既定は描く。 */
  drainage?: false | DrainageOptions;
}

export interface DecorateResult {
  /** 割り付けた駐車台数。**図面には書かない。** */
  stallCount: number;
  /** 外周の辺。画面で「どれが道路か」を選ばせるための一覧。 */
  edges: SiteEdge[];
  /** 実際に進入口を置いた辺の番号。置かなければ null。 */
  entranceEdgeIndex: number | null;
  /** 実際に放流先とした辺の番号。排水を描かなければ null。 */
  dischargeEdgeIndex: number | null;
}

/**
 * 申請地1筆ぶんを図面に載せる。
 *
 * `scene` を破壊的に更新する。`label` を渡すとラベル位置（空き地）を書き込む。
 */
export function decorateSubject(
  scene: Scene,
  outline: readonly PlaneXY[],
  neighbours: readonly NeighbourPolygon[],
  label: Parcel | undefined,
  opts: DecorateOptions = {},
): DecorateResult {
  const edges = boundaryEdges(outline, neighbours);

  const layout = opts.parking === false ? null : layoutParking(outline, opts.parking ?? {});
  if (layout) {
    scene.bands.push(...layout.bands);
    // 参考図面は区画のあいだに「通路」と書いている。台数は書かない。
    for (const at of layout.aisleCenters) {
      scene.notes.push({ text: '通路', at, rotationDeg: paperRotationFor(layout.bearingDeg) });
    }
  }

  // 進入口。フェンスは開口部で切る。切らないと車の入れない図面になる。
  const entranceEdge =
    opts.entrance === false ? null : pickEdge(edges, opts.entranceEdgeIndex) ?? defaultEntranceEdge(edges);
  let entranceEdgeIndex: number | null = null;
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
    opts.drainage === false ? null : pickEdge(edges, opts.dischargeEdgeIndex) ?? entranceEdge;
  let dischargeEdgeIndex: number | null = null;
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

  // 地番・地目・面積・所有者は4行になる。区画にも他の注記にも重なると読めないので、
  // 空き地を探して置く。注記は文字の大きさぶんの矩形として避ける。
  if (label) {
    const obstacles = [
      ...(layout ? layout.bands.map((b) => b.outline) : []),
      ...scene.notes.map((n) => noteBox(n.at, n.text.length * (n.sizeMm ?? 3.0), n.sizeMm ?? 3.0)),
    ];
    label.labelAt = labelSpot(outline, obstacles);
  }

  return { stallCount: layout?.count ?? 0, edges, entranceEdgeIndex, dischargeEdgeIndex };
}

/**
 * 注記が占める矩形。文字の大きさは紙上mmなので、縮尺で実寸に直す。
 * 1/250 で 3mm の文字は 0.75m。余裕を見て縦横に少し広げる。
 */
function noteBox(at: PlaneXY, widthMm: number, heightMm: number, scaleDenominator = 250): PlaneXY[] {
  const hw = (widthMm / 1000) * scaleDenominator / 2 + 0.5;
  const hh = (heightMm / 1000) * scaleDenominator / 2 + 0.5;
  return [
    { x: at.x - hh, y: at.y - hw },
    { x: at.x - hh, y: at.y + hw },
    { x: at.x + hh, y: at.y + hw },
    { x: at.x + hh, y: at.y - hw },
  ];
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
