/**
 * 地図をクリックして申請地の外形を描く画面。
 *
 * 登記所備付地図に筆が無い区域のためのフォールバック（CLAUDE.md 第1段階）。
 * **クリック座標は測量成果ではない。** その旨を画面に出し続ける。
 */

import { GSI_TILES, GsiTileKey } from '../data/gsi';
import { MapView } from './MapView';
import type { LonLat, ZoneNumber } from '../geo/crs';
import { toPlaneXY } from '../geo/crs';
import { area, perimeter } from '../geo/area';
import { m2ToTsubo } from '../draw/tsubo';
import { MIN_TRACE_POINTS } from '../scenes/fromTrace';

export interface TraceEditorProps {
  /** ピンの位置。地図の中心にする。 */
  pin: LonLat;
  zone: ZoneNumber;
  trace: LonLat[];
  onChange: (trace: LonLat[]) => void;
  tile: GsiTileKey;
  onTileChange: (t: GsiTileKey) => void;
}

const TRACE_ZOOM = 18;

export function TraceEditor({ pin, zone, trace, onChange, tile, onTileChange }: TraceEditorProps) {
  const xy = trace.map((p) => toPlaneXY(p, zone));
  const enough = trace.length >= MIN_TRACE_POINTS;
  const areaM2 = enough ? area(xy) : 0;
  const perimeterM = enough ? perimeter(xy) : 0;

  return (
    <div>
      <p style={{ margin: '0 0 0.5rem', fontSize: '0.9rem' }}>
        地図の上を<strong>順にクリック</strong>して、申請地の角をなぞってください。
        3点以上で外形になります。最後の点と最初の点は自動でつながるので、
        1周ぶんクリックしたら終わりです。
      </p>

      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap', margin: '0.5rem 0' }}>
        <button type="button" onClick={() => onChange(trace.slice(0, -1))} disabled={trace.length === 0}>
          1点戻す
        </button>
        <button type="button" onClick={() => onChange([])} disabled={trace.length === 0}>
          全部消す
        </button>
        <label>
          背景{' '}
          <select
            value={tile}
            onChange={(e) => onTileChange(e.target.value as GsiTileKey)}
            style={{ padding: '0.3rem' }}
          >
            {(Object.keys(GSI_TILES) as GsiTileKey[]).map((k) => (
              <option key={k} value={k}>{GSI_TILES[k].label}</option>
            ))}
          </select>
        </label>
        <span style={{ fontSize: '0.85rem', color: '#555' }}>
          田の境界は<strong>航空写真</strong>のほうが見えます。
        </span>
      </div>

      <div style={{ height: '30rem', border: '1px solid #ccc' }}>
        <MapView
          center={pin}
          zoom={TRACE_ZOOM}
          tile={tile}
          marker={pin}
          trace={trace}
          onClick={(p) => onChange([...trace, p])}
        />
      </div>

      <p style={{ margin: '0.6rem 0 0', fontSize: '0.9rem' }}>
        頂点 <strong>{trace.length}</strong> 点
        {enough && (
          <>
            　クリック座標による面積 <strong>{areaM2.toFixed(1)}㎡</strong>
            （{m2ToTsubo(areaM2).toFixed(1)}坪）　外周 {perimeterM.toFixed(1)}m
          </>
        )}
        {!enough && trace.length > 0 && <span style={{ color: '#a60' }}>　あと{MIN_TRACE_POINTS - trace.length}点</span>}
      </p>

      <p style={{ margin: '0.4rem 0 0', padding: '0.5rem 0.75rem', background: '#fff3f3', border: '1px solid #e5b8b8', fontSize: '0.85rem', color: '#a00' }}>
        <strong>この面積は測量成果ではありません。</strong>
        地理院タイルを目視でなぞった値で、数mの誤差を含みます。申請書に書く面積は
        登記簿または地積測量図の値を下の欄に入れてください。図面にはその値を記入します。
      </p>
    </div>
  );
}
