/**
 * 登記所備付地図データ（GeoJSON）の読み込み。
 *
 * ファイルは依頼者がG空間情報センターから落として選ぶ。
 * 実行時にサーバへ取りに行かない（CLAUDE.md「登記所備付地図データの扱い」）。
 */

import { useRef, useState } from 'react';
import { loadMojGeoJson, summarise, MojParcel, MojSummary } from '../data/moj';
import { zoneLabel } from '../geo/crs';

export interface MojLoaderProps {
  onLoaded: (parcels: MojParcel[]) => void;
}

/** 市区町村1件ぶんで数万筆になるので、読み込みは重い。目安を出す。 */
export function MojLoader({ onLoaded }: MojLoaderProps) {
  const [summary, setSummary] = useState<MojSummary | null>(null);
  const [name, setName] = useState('');
  const [skipped, setSkipped] = useState<{ reason: string; count: number }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  async function handle(file: File) {
    setBusy(true);
    setError(null);
    try {
      const text = await file.text();
      const result = loadMojGeoJson(JSON.parse(text));
      if (result.parcels.length === 0) {
        setError('筆を1件も読み取れませんでした。登記所備付地図のGeoJSONか確認してください。');
        setSummary(null);
        return;
      }
      setName(result.name || file.name);
      setSkipped(result.skipped);
      setSummary(summarise(result.parcels));
      onLoaded(result.parcels);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSummary(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h2 style={{ fontSize: '1.1rem' }}>登記所備付地図の読み込み</h2>
      <p style={{ fontSize: '0.9rem', color: '#555', margin: '0 0 0.6rem' }}>
        G空間情報センターで公開されている市区町村単位のGeoJSONを選んでください。
        読み込むと、ピンを指した場所の実際の筆界と地番が図面に入ります。
        ファイルはブラウザの中だけで処理し、どこにも送信しません。
      </p>

      <p>
        <input
          ref={inputRef}
          type="file"
          accept=".geojson,.json,application/geo+json,application/json"
          aria-label="登記所備付地図のGeoJSON"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handle(f);
          }}
        />
        {busy && <span style={{ marginLeft: '0.5rem' }}>読み込み中…</span>}
      </p>

      {error && <p style={{ color: '#b00' }}>{error}</p>}

      {summary && (
        <div style={{ padding: '0.75rem 1rem', border: '1px solid #ccc', background: '#fafafa' }}>
          <p style={{ margin: '0 0 0.4rem' }}>
            <strong>{name}</strong>
          </p>
          <p style={{ margin: '0 0 0.4rem' }}>
            読み込んだ筆数 <strong>{summary.total.toLocaleString()}</strong>
            {summary.cities.length > 0 && `　市区町村 ${summary.cities.join('、')}`}
            {summary.zones.length > 0 && `　${summary.zones.map(zoneLabel).join('、')}`}
          </p>
          <p style={{ margin: '0 0 0.4rem', fontSize: '0.9rem' }}>
            座標値種別:{' '}
            {Object.entries(summary.byCoordKind).map(([k, v]) => `${k} ${v.toLocaleString()}`).join(' ／ ')}
            <br />
            精度区分:{' '}
            {Object.entries(summary.byPrecision).map(([k, v]) => `${k} ${v.toLocaleString()}`).join(' ／ ')}
          </p>
          {summary.usableForArea < summary.total && (
            <p style={{ margin: '0.4rem 0 0', color: '#a00', fontSize: '0.9rem' }}>
              このうち <strong>{(summary.total - summary.usableForArea).toLocaleString()}筆</strong>は
              座標値種別が「測量成果」ではありません（紙の図面を数値化したもの）。
              周辺の描画には使えますが、<strong>求積には使わないでください。</strong>
            </p>
          )}
          {skipped.length > 0 && (
            <p style={{ margin: '0.4rem 0 0', color: '#a60', fontSize: '0.85rem' }}>
              読み飛ばし: {skipped.map((s) => `${s.reason} ${s.count}件`).join('、')}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
