/**
 * 第0段階の画面。縮尺とフォントを実証するためだけの最小構成。
 * 第1段階で地図ビューと住所検索が入る。
 */

import { useState } from 'react';
import { loadFontBytesFromNetwork } from '../pdf/font';
import { buildStage0Pdf, buildCalibrationPdf } from '../pdf/stage0';
import type { TitleBlockRow } from '../pdf/frame';

function download(bytes: Uint8Array, filename: string) {
  const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const INITIAL_ROWS: TitleBlockRow[] = [
  { label: '会社名', value: '' },
  { label: '作成日', value: '' },
  { label: '作成者', value: '' },
];

export function App() {
  const [rows, setRows] = useState<TitleBlockRow[]>(INITIAL_ROWS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(i: number, patch: Partial<TitleBlockRow>) {
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  async function run(kind: 'plan' | 'calibration') {
    setBusy(true);
    setError(null);
    try {
      const fontBytes = await loadFontBytesFromNetwork();
      if (kind === 'plan') {
        const filled = rows.filter((r) => r.label.trim() !== '' || r.value.trim() !== '');
        download(await buildStage0Pdf(fontBytes, { titleBlockRows: filled }), '計画平面図_第0段階.pdf');
      } else {
        download(await buildCalibrationPdf(fontBytes), '縮尺検証シート.pdf');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 720, margin: '2rem auto', padding: '0 1rem', lineHeight: 1.7 }}>
      <h1 style={{ fontSize: '1.4rem' }}>計画平面図 作成（第0段階）</h1>
      <p>
        縮尺1/250とフォント埋め込みの実証だけを行う段階です。20.000m×20.000mの正方形を1つ描いた
        A3横のPDFを出します。敷地データの取り込みは第1段階で入ります。
      </p>

      <h2 style={{ fontSize: '1.1rem', marginTop: '2rem' }}>表題欄</h2>
      <p style={{ fontSize: '0.9rem', color: '#555' }}>
        図面右下の枠に入る内容です。空のままにすると枠だけを引きます。
      </p>
      <table style={{ borderCollapse: 'collapse' }}>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              <td style={{ padding: '0.2rem 0.4rem 0.2rem 0' }}>
                <input
                  aria-label={`項目名${i + 1}`}
                  value={row.label}
                  placeholder="項目名"
                  onChange={(e) => update(i, { label: e.target.value })}
                  style={{ width: '9rem', padding: '0.3rem' }}
                />
              </td>
              <td style={{ padding: '0.2rem 0' }}>
                <input
                  aria-label={`値${i + 1}`}
                  value={row.value}
                  placeholder="内容"
                  onChange={(e) => update(i, { value: e.target.value })}
                  style={{ width: '18rem', padding: '0.3rem' }}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        <button type="button" onClick={() => setRows((r) => [...r, { label: '', value: '' }])}>
          行を追加
        </button>
      </p>

      <h2 style={{ fontSize: '1.1rem', marginTop: '2rem' }}>出力</h2>
      <p style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <button type="button" disabled={busy} onClick={() => run('plan')} style={{ padding: '0.6rem 1rem' }}>
          計画平面図PDFを出力
        </button>
        <button type="button" disabled={busy} onClick={() => run('calibration')} style={{ padding: '0.6rem 1rem' }}>
          縮尺検証シートを出力
        </button>
      </p>
      {busy && <p>生成中…</p>}
      {error && <p style={{ color: '#b00' }}>エラー: {error}</p>}

      <div style={{ marginTop: '2rem', padding: '1rem', background: '#f5f5f5', fontSize: '0.9rem' }}>
        <strong>印刷するときの注意</strong>
        <p style={{ margin: '0.5rem 0 0' }}>
          プリンタ設定は必ず「実際のサイズ（100%）」にしてください。「用紙に合わせる」を選ぶと
          数％縮んで縮尺が狂います。縮尺検証シートを印刷して、100mm・200mm・80mmの線を
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
