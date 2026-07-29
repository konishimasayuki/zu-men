/**
 * 図面の規格値。**すべて出典のある数値だけを置く。**
 *
 * ここに憶測で数値を書かない。写真から目測した値を使う場合は、
 * その旨と根拠を明記し、規格値と区別できるようにする。
 *
 * 出典
 * - JIS Z 8311:1998 製図―製図用紙のサイズ及び図面の様式
 * - JIS Z 8312:1999 製図―表示の一般原則―線の基本原則
 * - 作業規程の準則 付録7 公共測量標準図式（国土地理院）
 * - 農地法関係事務処理要領（農林水産省）
 * - 駐車場法施行令第7条／駐車場設計・施工指針
 */

/* ============================================ JIS Z 8311:1998 図面の様式 */

export const JIS_Z8311 = {
  /**
   * とじしろの幅[mm]。
   * 「最小幅20mm（輪郭を含む）で、表題欄から最も離れた左の端に置く」
   * 表題欄は右下隅に置かれるので、とじしろは左端になる。
   * 参考図面の綴じ穴が左端にあるのはこの規定どおり。
   */
  bindingMarginMm: 20,

  /** 輪郭線の太さ[mm]。「最小0.5mmの太さの実線で描くのがよい」 */
  frameLineMinMm: 0.5,

  /** 中心マーク。用紙の端から輪郭線の内側まで約5mm、太さ最小0.5mm。 */
  centerMark: { reachMm: 5, lineMm: 0.5, toleranceMm: 0.5 },

  /** 表題欄。用紙の右下隅、長さ170mm以下。 */
  titleBlock: { maxLengthMm: 170 },
} as const;

/* ================================== JIS Z 8312:1999 線の太さの標準数列 */

/** 公比√2の数列。線の太さはこのいずれかにする。 */
export const JIS_Z8312_WIDTHS_MM = [0.13, 0.18, 0.25, 0.35, 0.5, 0.7, 1.0, 1.4, 2.0] as const;

/** 極太線:太線:細線 = 4:2:1 */
export const JIS_Z8312_RATIO = { extraThick: 4, thick: 2, thin: 1 } as const;

/* ============================ 公共測量標準図式（作業規程の準則 付録7） */

/**
 * 第7条 線の区分。地形図系の図面はこちらの数列を使う。
 * 線の太さの許容誤差は各線号を通じて ±0.025mm。
 */
export const SURVEY_LINE_WIDTHS_MM = {
  1: 0.05,
  2: 0.10,
  3: 0.15,
  4: 0.20,
  5: 0.25,
  6: 0.30,
  7: 0.35,
  8: 0.40,
  10: 0.50,
} as const;

export type SurveyLineNumber = keyof typeof SURVEY_LINE_WIDTHS_MM;

export const SURVEY_LINE_TOLERANCE_MM = 0.025;

/**
 * 第6条 地図記号及び文字の大きさの許容誤差。
 * 「表現上やむを得ないものに限り定められた大きさに対して図上±0.2mm以内」
 */
export const SYMBOL_SIZE_TOLERANCE_MM = 0.2;

/**
 * 公共測量標準図式の用語。参考図面の記号はこの体系のもの。
 * 画面や図面の注記でもこの語を使う。
 *
 * - 構囲（第30条）: 建物及び敷地等の周辺を区画する囲壁の類。塀・柵・生垣など。
 * - 法面（第29条）: 切土あるいは盛土によって人工的に作られた斜面の部分。
 * - 被覆: 射影をもつ記号。上端は太線、下端は細線で描く（第46条・第48条）。
 * - 諸地（第31条）: 建物以外の土地。空地・**駐車場**・花壇・園庭・墓地・材料置場。
 * - 水部（第26条）: 河川、細流、かれ川、**用水路**、湖池、海岸線、地下水路。
 */
export const SURVEY_TERMS = {
  fence: '構囲',
  slope: '法面',
  revetment: '被覆',
  openLand: '諸地',
  waterway: '用水路',
} as const;

/** 側溝（U字溝・L字溝）の線号は3号＝0.15mm。 */
export const SIDE_DITCH_LINE_NUMBER: SurveyLineNumber = 3;

/* ========================= 農地法関係事務処理要領（農林水産省） */

/**
 * 農地転用許可申請に添付する図面。3種類が定められている。
 *
 * 本アプリが作るのは (3)。参考図面もこれにあたる。
 */
export const NOUCHI_DRAWINGS = {
  /** (1) 申請に係る土地の地番を表示する図面 */
  chibanMap: { name: '地番を表示する図面' },

  /** (2) 転用候補地の位置及び附近の状況を表示する図面 */
  locationMap: {
    name: '位置及び附近の状況を表示する図面',
    scaleMin: 10_000,
    scaleMax: 50_000,
  },

  /**
   * (3) 転用候補地に建設しようとする建物又は施設の
   *     「面積、位置及び施設物間の距離」を表示する図面。
   *
   * **縮尺は500分の1ないし2,000分の1程度。**
   * 本アプリの既定は1/250で、この範囲より詳細側にある。
   * より詳しい方向なので通常は差し支えないが、用紙に収まらない原因でもある。
   *
   * **「施設物間の距離」の表示が求められている点に注意。**
   * 参考図面に寸法線は無いが、要領は距離の表示を挙げている。
   */
  layoutPlan: {
    name: '施設の面積・位置及び施設物間の距離を表示する図面',
    scaleMin: 500,
    scaleMax: 2_000,
    requiresDistances: true,
  },
} as const;

/** 縮尺が要領の推奨範囲に入っているか。 */
export function isLayoutPlanScaleRecommended(scaleDenominator: number): boolean {
  return (
    scaleDenominator >= NOUCHI_DRAWINGS.layoutPlan.scaleMin &&
    scaleDenominator <= NOUCHI_DRAWINGS.layoutPlan.scaleMax
  );
}

/**
 * 事業計画で明示が求められる、図面に載せるべき周辺の要素。
 * 参考図面が市道と用悪水路を大きく描いているのは、これが審査事項だから。
 */
export const NOUCHI_REQUIRED_CONTEXT = [
  '候補地内に含まれる道路、水路等公共施設の種類及び数量',
  '転用することによって生ずる付近の農地、作物等の被害の防除施設の概要',
  '取水及び排水の予定地・処理方法',
] as const;

/* ================= 駐車場法施行令第7条／駐車場設計・施工指針 */

export const PARKING_STANDARDS = {
  /** 普通乗用車の駐車マス。幅2.5m × 奥行5.0m。 */
  stall: { widthM: 2.5, depthM: 5.0 },

  /** 車路の幅員。対面通行は5.5m以上、一方通行は3.5m以上。 */
  aisle: { twoWayMinM: 5.5, oneWayMinM: 3.5 },
} as const;

/** 車路幅が基準を満たすか。 */
export function isAisleWidthValid(widthM: number, oneWay: boolean): boolean {
  return widthM >= (oneWay ? PARKING_STANDARDS.aisle.oneWayMinM : PARKING_STANDARDS.aisle.twoWayMinM);
}
