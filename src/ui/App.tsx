/**
 * 第0段階の画面。縮尺とフォントを実証するためだけの最小構成。
 * 第1段階で地図ビューと住所検索が入る。
 */

import { useState } from 'react';
import { loadFontBytesFromNetwork } from '../pdf/font';
import { downloadBytes } from './download';
import { buildStage0Pdf, buildCalibrationPdf } from '../pdf/stage0';
import { PAPER_SIZES, PAPER_ORDER, DEFAULT_PAPER, frameExtentMeters } from '../paper/layout';
import type { PaperSizeName } from '../paper/layout';
import { DEFAULT_SCALE_DENOMINATOR } from '../paper/transform';
import { useCalibration, DEFAULT_NOMINAL_MM } from './useCalibration';
import { SitePicker, SiteSelection } from './SitePicker';
import { PlanPanel } from './PlanPanel';

export function App() {
  const [paperName, setPaperName] = useState<PaperSizeName>(DEFAULT_PAPER.name);
  const [site, setSite] = useState<SiteSelection | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cal = useCalibration();

  const paper = PAPER_SIZES[paperName];
  const extent = frameExtentMeters(paper, DEFAULT_SCALE_DENOMINATOR);
  const blocked = cal.state.enabled && cal.error !== null;

  async function run(kind: 'plan' | 'calibration') {
    setBusy(true);
    setError(null);
    try {
      const fontBytes = await loadFontBytesFromNetwork();
      const suffix = cal.calibration ? '_補正あり' : '';
      if (kind === 'plan') {
        downloadBytes(
          await buildStage0Pdf(fontBytes, { paper, calibration: cal.calibration }),
          `計画平面図_第0段階_${paper.name}${suffix}.pdf`,
        );
      } else {
        downloadBytes(
          await buildCalibrationPdf(fontBytes, paper, cal.calibration),
          `縮尺検証シート_${paper.name}${suffix}.pdf`,
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 860, margin: '2rem auto', padding: '0 1rem', lineHeight: 1.7 }}>
      <h1 style={{ fontSize: '1.4rem' }}>計画平面図 作成</h1>
      <p>
        住所を検索し、地図でピンを対象地に合わせると、その場所の計画平面図をPDFで出せます。
        縮尺は1/250固定です。
      </p>

      <SitePicker value={site} onChange={setSite} />

      <hr style={{ margin: '2rem 0', border: 'none', borderTop: '1px solid #ddd' }} />

      <PlanPanel site={site} calibration={cal.calibration} />

      <hr style={{ margin: '2rem 0', border: 'none', borderTop: '1px solid #ddd' }} />

      <h2 style={{ fontSize: '1.1rem', marginTop: '2rem' }}>用紙</h2>
      <p>
        <select
          aria-label="用紙サイズ"
          value={paperName}
          onChange={(e) => setPaperName(e.target.value as PaperSizeName)}
          style={{ padding: '0.4rem' }}
        >
          {PAPER_ORDER.map((n) => (
            <option key={n} value={n}>
              {n}横（{PAPER_SIZES[n].widthMm}×{PAPER_SIZES[n].heightMm}mm）
            </option>
          ))}
        </select>
      </p>
      <p style={{ fontSize: '0.9rem', color: '#555' }}>
        この用紙の図郭に入る実寸は <strong>{extent.widthM.toFixed(2)}m × {extent.heightM.toFixed(2)}m</strong>
        （縮尺1/{DEFAULT_SCALE_DENOMINATOR}）。敷地と周辺がこれに収まらない場合は、
        大きい用紙を選んでその用紙で等倍印刷してください。
        <strong>大きい用紙の図面をA4に縮小印刷すると縮尺が狂います。</strong>
      </p>

      <h2 style={{ fontSize: '1.1rem', marginTop: '2rem' }}>印刷補正</h2>
      <p style={{ fontSize: '0.9rem', color: '#555' }}>
        プリンタ設定を「実際のサイズ（100%）」にしても、機種によっては出力が数％伸縮します。
        まず補正なしで縮尺検証シートを印刷し、200mmの線を定規で測ってください。
        200.0mmでなければ、その実測値をここに入れると補正できます。
      </p>
      <p>
        <label>
          <input
            type="checkbox"
            checked={cal.state.enabled}
            onChange={(e) => cal.setState({ enabled: e.target.checked })}
          />{' '}
          印刷補正を有効にする
        </label>
      </p>
      {cal.state.enabled && (
        <div style={{ paddingLeft: '1.5rem' }}>
          <p>
            <label>
              基準長{' '}
              <input
                type="number"
                value={cal.state.nominalMm}
                min={10}
                step={10}
                onChange={(e) => cal.setState({ nominalMm: Number(e.target.value) })}
                style={{ width: '5rem', padding: '0.3rem' }}
              />{' '}
              mm（検証シートの線。既定は{DEFAULT_NOMINAL_MM}mm）
            </label>
          </p>
          <p>
            <label>
              定規で測った実測値{' '}
              <input
                type="number"
                value={cal.state.measuredMmText}
                step={0.1}
                placeholder="198.5"
                onChange={(e) => cal.setState({ measuredMmText: e.target.value })}
                style={{ width: '6rem', padding: '0.3rem' }}
              />{' '}
              mm
            </label>
          </p>
          {cal.factor !== null && (
            <p style={{ color: '#060' }}>
              補正倍率 <strong>{cal.factor.toFixed(5)}</strong> を適用します。
            </p>
          )}
          {cal.error && <p style={{ color: '#b00' }}>{cal.error}</p>}
          <p style={{ fontSize: '0.85rem', color: '#555' }}>
            補正を有効にしたPDFは、<strong>データとしては1/250ではなくなります。</strong>
            そのプリンタで紙に出したときに1/250になります。PDFをそのまま電子提出する場合は
            補正を無効にしてください。
          </p>
        </div>
      )}

      <h2 style={{ fontSize: '1.1rem', marginTop: '2rem' }}>検証用の出力</h2>
      <p style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <button type="button" disabled={busy || blocked} onClick={() => run('plan')} style={{ padding: '0.6rem 1rem' }}>
          20m正方形の検証PDF
        </button>
        <button type="button" disabled={busy || blocked} onClick={() => run('calibration')} style={{ padding: '0.6rem 1rem' }}>
          縮尺検証シートを出力
        </button>
      </p>
      {busy && <p>生成中…</p>}
      {error && <p style={{ color: '#b00' }}>エラー: {error}</p>}

      <div style={{ marginTop: '2rem', padding: '1rem', background: '#f5f5f5', fontSize: '0.9rem' }}>
        <strong>印刷するときの注意</strong>
        <p style={{ margin: '0.5rem 0 0' }}>
          プリンタ設定は必ず「実際のサイズ（100%）」にしてください。「用紙に合わせる」を選ぶと
          数％縮んで縮尺が狂います。縮尺検証シートを{paper.name}に印刷して、100mm・200mm・80mmの線を
          定規で測って確かめられます。
        </p>
      </div>

      <p style={{ marginTop: '2rem', fontSize: '0.85rem', color: '#555' }}>
        本アプリの座標は地積測量図の値で確定するものです。地図データやクリック座標を
        測量成果として扱わないでください。
      </p>
    </main>
  );
}
