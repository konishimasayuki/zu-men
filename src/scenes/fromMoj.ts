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

  // 申請地の外周にフェンスを回す
  for (const p of subjectParcels) {
    const outline = p.outline.map((q) => toPlaneXY(q, zone));
    scene.edgings.push({ kind: 'fence', path: outline.concat([outline[0]]) });
  }

  return {
    scene,
    subjects: subjectParcels,
    neighbours: neighbourParcels,
    computedAreas,
    totalAreaM2: computedAreas.reduce((s, a) => s + a.areaM2, 0),
  };
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
