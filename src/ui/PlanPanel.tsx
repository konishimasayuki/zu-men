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
import { countStalls } from '../draw/parking';
import { tsuboToM2, formatTsuboWithM2 } from '../draw/tsubo';
import type { PrinterCalibration } from '../paper/calibration';
import type { SiteSelection } from './SitePicker';

export interface PlanPanelProps {
  site: SiteSelection | null;
  calibration: PrinterCalibration | undefined;
}

/** 敷地の規模の候補。依頼者の対象2件。 */
const PRESETS = [90, 143];

export function PlanPanel({ site, calibration }: PlanPanelProps) {
  const [tsubo, setTsubo] = useState(143);
  const [bearingDeg, setBearingDeg] = useState(80);
  const [chiban, setChiban] = useState('');
  const [chimoku, setChimoku] = useState('田');
  const [owner, setOwner] = useState('');
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

  // ピンの位置が敷地の中心になる
  const center = toPlaneXY(site.position, site.zone);
  const scene = makeSampleScene({
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
      downloadBytes(pdf, `計画平面図_${tsubo}坪_${paper.name}.pdf`);
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

      <div style={row}>
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

      <div style={row}>
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
        <input value={chiban} placeholder="44-4" onChange={(e) => setChiban(e.target.value)} style={{ width: '8rem', padding: '0.3rem' }} />
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
        {formatTsuboWithM2(tsubo)}・駐車{countStalls(scene.bands)}台。
        敷地の形は矩形の仮置きです。実際の筆界は登記所備付地図を取り込んでから確定します。
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
