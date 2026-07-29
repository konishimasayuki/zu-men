/**
 * 地図で指した場所の計画平面図を出す。
 *
 * これがこのアプリの本体。住所を検索してピンを合わせ、ここで坪数と向きを
 * 決めると、その場所を中心にした計画平面図のPDFが出る。
 */

import { useState } from 'react';
import { loadFontBytesFromNetwork } from '../pdf/font';
import { downloadBytes } from './download';
import { buildPlanPdf, checkFit, originCenteredOn } from '../pdf/plan';
import { PAPER_SIZES, PAPER_ORDER, DEFAULT_PAPER } from '../paper/layout';
import type { PaperSizeName } from '../paper/layout';
import { DEFAULT_SCALE_DENOMINATOR } from '../paper/transform';
import { toPlaneXY } from '../geo/crs';
import { makeSampleScene } from '../scenes/sample';
import { countStalls, DEFAULT_STALL } from '../draw/parking';
import { PARKING_STANDARDS } from '../draw/standards';
import { tsuboToM2, formatTsuboWithM2 } from '../draw/tsubo';
import type { PrinterCalibration } from '../paper/calibration';
import type { SiteSelection } from './SitePicker';
import { MojParcel, parcelAt, precisionNote, isUsableForArea } from '../data/moj';
import { buildSceneFromMoj, nearestParcel } from '../scenes/fromMoj';
import { MIN_EDGE_M, SiteEdge } from '../draw/site';
import { m2ToTsubo } from '../draw/tsubo';

export interface PlanPanelProps {
  site: SiteSelection | null;
  calibration: PrinterCalibration | undefined;
  /** 登記所備付地図から読み込んだ筆。空なら仮置きの矩形で描く。 */
  mojParcels: MojParcel[];
}

/** 敷地の規模の候補。依頼者の対象2件。 */
const PRESETS = [90, 143];

export function PlanPanel({ site, calibration, mojParcels }: PlanPanelProps) {
  const [tsubo, setTsubo] = useState(143);
  const [bearingDeg, setBearingDeg] = useState(80);
  const [chiban, setChiban] = useState('');
  const [chimoku, setChimoku] = useState('田');
  const [owner, setOwner] = useState('');
  const [oneWay, setOneWay] = useState(false);
  // 道路側・放流先は推定できないので画面で選ばせる。null は「未選択（いちばん長い辺）」。
  const [entranceEdge, setEntranceEdge] = useState<number | null>(null);
  const [dischargeEdge, setDischargeEdge] = useState<number | null>(null);
  const [paperName, setPaperName] = useState<PaperSizeName>(DEFAULT_PAPER.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const paper = PAPER_SIZES[paperName];

  if (!site) {
    return (
      <section>
        <h2 style={{ fontSize: '1.1rem' }}>計画平面図</h2>
        <p style={{ color: '#777' }}>
          先に上で住所を検索し、地図でピンを対象地に合わせてください。
          ピンの位置がそのまま図面の中心になります。
        </p>
      </section>
    );
  }

  // ピンの位置が図面の中心になる
  const center = toPlaneXY(site.position, site.zone);

  // 地図データを読み込んでいれば、ピンが指す実際の筆を申請地にする
  const hit = mojParcels.length > 0
    ? (parcelAt(mojParcels, site.position) ?? nearestParcel(mojParcels, site.position))
    : null;

  const built = hit
    ? buildSceneFromMoj({
        parcels: mojParcels,
        subjects: [{
          id: hit.id,
          chimoku: chimoku.trim() || undefined,
          owner: owner.trim() || undefined,
        }],
        zone: site.zone,
        center,
        paper,
        scaleDenominator: DEFAULT_SCALE_DENOMINATOR,
        parking: { oneWay },
        ...(entranceEdge === null ? {} : { entranceEdgeIndex: entranceEdge }),
        ...(dischargeEdge === null ? {} : { dischargeEdgeIndex: dischargeEdge }),
      })
    : null;

  const scene = built
    ? built.scene
    : makeSampleScene({
        center,
        tsubo,
        bearingDeg,
        chiban: chiban.trim() || '（地番未入力）',
        chimoku,
        owner: owner.trim(),
        aspect: 1.45,
        stallsPerBand: Math.max(2, Math.round((Math.sqrt(tsuboToM2(tsubo) * 1.45) - 5) / 2.5)),
        bandCount: 2,
      });
  const fit = checkFit(scene, paper, DEFAULT_SCALE_DENOMINATOR);
  const aisleM = oneWay ? PARKING_STANDARDS.aisle.oneWayMinM : PARKING_STANDARDS.aisle.twoWayMinM;

  async function output() {
    setBusy(true);
    setError(null);
    try {
      const fontBytes = await loadFontBytesFromNetwork();
      const pdf = await buildPlanPdf(scene, fontBytes, {
        paper,
        scaleDenominator: DEFAULT_SCALE_DENOMINATOR,
        calibration,
        // 図面の外接矩形ではなく、指したピンを紙の中心に置く
        origin: originCenteredOn(center, paper, DEFAULT_SCALE_DENOMINATOR),
      });
      const stem = hit ? hit.label : `${tsubo}坪`;
      downloadBytes(pdf, `計画平面図_${stem}_${paper.name}.pdf`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const row = { display: 'flex', gap: '0.5rem', alignItems: 'center', margin: '0.5rem 0' } as const;

  return (
    <section>
      <h2 style={{ fontSize: '1.1rem' }}>計画平面図</h2>
      <p style={{ fontSize: '0.9rem', color: '#555', margin: '0 0 1rem' }}>
        ピンの位置（{site.position.lat.toFixed(6)}, {site.position.lon.toFixed(6)}）を中心に、
        縮尺1/{DEFAULT_SCALE_DENOMINATOR}で描きます。
      </p>

      {hit && built && (
        <div style={{ padding: '0.75rem 1rem', border: '1px solid #bcd8bc', background: '#eef7ee', margin: '0 0 1rem' }}>
          <p style={{ margin: 0 }}>
            申請地: <strong>{hit.label}</strong>（{hit.cityName}）
          </p>
          <p style={{ margin: '0.3rem 0 0', fontSize: '0.9rem' }}>
            座標法による面積 <strong>{built.computedAreas[0]?.areaM2.toFixed(1)}㎡</strong>
            （{m2ToTsubo(built.computedAreas[0]?.areaM2 ?? 0).toFixed(1)}坪）
            周辺 {built.neighbours.length}筆を描画
          </p>
          <p style={{ margin: '0.3rem 0 0', fontSize: '0.9rem' }}>
            {built.stallCount > 0 ? (
              <>
                駐車区画 <strong>{built.stallCount}台</strong>を割り付けました
                （マス{DEFAULT_STALL.widthM}×{DEFAULT_STALL.depthM}m、車路{aisleM}m）。
                <span style={{ color: '#555' }}>台数は図面には記載しません。</span>
              </>
            ) : (
              <span style={{ color: '#a00' }}>
                この筆には車路（{aisleM}m）を取った区画が入りませんでした。
                筆が狭いか細長い可能性があります。図面には筆界とフェンスのみ描きます。
                {!oneWay && '　一方通行にすると車路が3.5mになり、入る場合があります。'}
              </span>
            )}
          </p>
          <p style={{ margin: '0.3rem 0 0', fontSize: '0.9rem' }}>
            <label>
              <input type="checkbox" checked={oneWay} onChange={(e) => setOneWay(e.target.checked)} />{' '}
              車路を一方通行にする（{PARKING_STANDARDS.aisle.oneWayMinM}m。既定は対面
              {PARKING_STANDARDS.aisle.twoWayMinM}m。駐車場法施行令第7条）
            </label>
          </p>

          <div style={{ marginTop: '0.6rem', paddingTop: '0.6rem', borderTop: '1px solid #cfe0cf' }}>
            <p style={{ margin: '0 0 0.4rem', fontSize: '0.85rem', color: '#a00' }}>
              <strong>登記所備付地図に地目は入っていません。</strong>
              どの辺が道路でどの辺が水路かはデータから判定できないため、下で選んでください。
              初期値はいちばん長い辺で、これは推定ではありません。
            </p>
            <p style={{ margin: '0 0 0.3rem', fontSize: '0.9rem' }}>
              <label>
                進入口を置く辺{' '}
                <select
                  value={entranceEdge ?? ''}
                  onChange={(e) => setEntranceEdge(e.target.value === '' ? null : Number(e.target.value))}
                  style={{ padding: '0.25rem' }}
                >
                  <option value="">自動（いちばん長い辺）</option>
                  {built.edges
                    .filter((e) => e.lengthM >= MIN_EDGE_M)
                    .map((e) => (
                      <option key={e.index} value={e.index}>
                        {edgeLabel(e)}
                      </option>
                    ))}
                </select>
              </label>
            </p>
            <p style={{ margin: 0, fontSize: '0.9rem' }}>
              <label>
                雨水の放流先の辺{' '}
                <select
                  value={dischargeEdge ?? ''}
                  onChange={(e) => setDischargeEdge(e.target.value === '' ? null : Number(e.target.value))}
                  style={{ padding: '0.25rem' }}
                >
                  <option value="">進入口と同じ辺</option>
                  {built.edges
                    .filter((e) => e.lengthM >= MIN_EDGE_M)
                    .map((e) => (
                      <option key={e.index} value={e.index}>
                        {edgeLabel(e)}
                      </option>
                    ))}
                </select>
              </label>
            </p>
            <p style={{ margin: '0.3rem 0 0', fontSize: '0.85rem', color: '#555' }}>
              舗装すると雨水が浸透しなくなります。<strong>隣接農地へ流さないこと</strong>が
              審査上の最大の論点なので、放流先には道路の側溝か水路に面した辺を選んでください。
            </p>
          </div>
          <p style={{ margin: '0.3rem 0 0', fontSize: '0.85rem', color: isUsableForArea(hit) ? '#060' : '#a00' }}>
            {precisionNote(hit)}
          </p>
        </div>
      )}

      {!hit && (
        <p style={{ fontSize: '0.9rem', color: '#a60' }}>
          登記所備付地図をまだ読み込んでいません。敷地は下の設定で矩形の仮置きになります。
        </p>
      )}

      <div style={{ ...row, display: hit ? 'none' : 'flex' }}>
        <span style={{ width: '6rem' }}>敷地の広さ</span>
        {PRESETS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTsubo(t)}
            style={{
              padding: '0.35rem 0.7rem',
              fontWeight: tsubo === t ? 700 : 400,
              background: tsubo === t ? '#e8f0e8' : undefined,
            }}
          >
            {t}坪
          </button>
        ))}
        <input
          type="number"
          aria-label="坪数"
          value={tsubo}
          min={10}
          onChange={(e) => setTsubo(Number(e.target.value))}
          style={{ width: '5rem', padding: '0.3rem' }}
        />
        <span style={{ color: '#555' }}>坪 ＝ {tsuboToM2(tsubo).toFixed(1)}㎡</span>
      </div>

      <div style={{ ...row, display: hit ? 'none' : 'flex' }}>
        <span style={{ width: '6rem' }}>敷地の向き</span>
        <input
          type="range"
          aria-label="敷地の向き"
          min={0}
          max={179}
          value={bearingDeg}
          onChange={(e) => setBearingDeg(Number(e.target.value))}
          style={{ width: '14rem' }}
        />
        <span style={{ color: '#555' }}>
          長手が北から{bearingDeg}度（90度で東西）
        </span>
      </div>

      <div style={row}>
        <span style={{ width: '6rem' }}>地番</span>
        <input
          value={hit ? hit.chiban : chiban}
          placeholder="44-4"
          disabled={!!hit}
          onChange={(e) => setChiban(e.target.value)}
          style={{ width: '8rem', padding: '0.3rem' }}
        />
        <span>地目</span>
        <input value={chimoku} onChange={(e) => setChimoku(e.target.value)} style={{ width: '4rem', padding: '0.3rem' }} />
        <span>所有者</span>
        <input value={owner} placeholder="（任意）" onChange={(e) => setOwner(e.target.value)} style={{ width: '10rem', padding: '0.3rem' }} />
      </div>

      <div style={row}>
        <span style={{ width: '6rem' }}>用紙</span>
        <select value={paperName} onChange={(e) => setPaperName(e.target.value as PaperSizeName)} style={{ padding: '0.3rem' }}>
          {PAPER_ORDER.map((n) => (
            <option key={n} value={n}>{n}横</option>
          ))}
        </select>
        <span style={{ color: fit.fits ? '#060' : '#a00' }}>
          {fit.fits
            ? `収まります（図面 ${fit.contentWidthM.toFixed(1)}×${fit.contentHeightM.toFixed(1)}m ／ 図郭 ${fit.frameWidthM.toFixed(1)}×${fit.frameHeightM.toFixed(1)}m）`
            : `収まりません。${fit.suggestion?.name ?? 'より大きい用紙'}をお使いください（縮小印刷はしないでください）`}
        </span>
      </div>

      <p style={{ fontSize: '0.9rem', color: '#555' }}>
        {hit
          ? `登記所備付地図の筆界で描いています。地目と所有者はこのデータに含まれないため、上で入力してください。`
          : `${formatTsuboWithM2(tsubo)}・駐車${countStalls(scene.bands)}台。敷地の形は矩形の仮置きです。`}
      </p>

      <p>
        <button type="button" disabled={busy} onClick={() => void output()} style={{ padding: '0.7rem 1.2rem', fontSize: '1rem' }}>
          {busy ? '生成中…' : 'この場所の計画平面図PDFを出力'}
        </button>
      </p>
      {error && <p style={{ color: '#b00' }}>エラー: {error}</p>}
    </section>
  );
}

/** 辺の選択肢の表示。隣にどの筆があるかが分かれば、それが道路かどうか判断できる。 */
function edgeLabel(e: SiteEdge): string {
  const dir = compass(e.outward);
  const neighbour = e.neighbourChiban ? `隣 ${e.neighbourChiban}` : '隣接筆なし';
  return `${dir}向き・長さ${e.lengthM.toFixed(1)}m・${neighbour}`;
}

/** 外向きベクトルを八方位の文字にする。X=北・Y=東。 */
function compass(v: { x: number; y: number }): string {
  const deg = ((Math.atan2(v.y, v.x) * 180) / Math.PI + 360) % 360;
  const names = ['北', '北東', '東', '南東', '南', '南西', '西', '北西'];
  return names[Math.round(deg / 45) % 8];
}
