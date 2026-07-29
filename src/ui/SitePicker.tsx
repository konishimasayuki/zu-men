/**
 * 住所を検索して対象地を決め、系番号を確認させる画面。
 *
 * 系を1つ間違えると座標が数十kmずれるため、推定値をそのまま使わせない。
 * 推定した系・その根拠・確からしさを出し、ユーザーが確定する。
 */

import { useRef, useState } from 'react';
import { searchAddress, AddressHit, GSI_TILES, GsiTileKey } from '../data/gsi';
import { estimateZone, ZoneEstimate } from '../geo/zone';
import { ZONE_DEFINITIONS, ZONE_NUMBERS, zoneLabel, toPlaneXY } from '../geo/crs';
import type { LonLat, ZoneNumber } from '../geo/crs';
import { MapView } from './MapView';

export interface SiteSelection {
  address: string | null;
  position: LonLat;
  zone: ZoneNumber;
}

export interface SitePickerProps {
  value: SiteSelection | null;
  onChange: (s: SiteSelection) => void;
}

const INITIAL_CENTER: LonLat = { lon: 138.0, lat: 37.5 };
const INITIAL_ZOOM = 5;
const SITE_ZOOM = 17;

export function SitePicker({ value, onChange }: SitePickerProps) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<AddressHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tile, setTile] = useState<GsiTileKey>('pale');
  const [estimate, setEstimate] = useState<ZoneEstimate | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const center = value?.position ?? INITIAL_CENTER;
  const zoom = value ? SITE_ZOOM : INITIAL_ZOOM;

  async function runSearch() {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setSearching(true);
    setError(null);
    try {
      const found = await searchAddress(query, controller.signal);
      setHits(found);
      if (found.length === 0) setError('該当する住所が見つかりませんでした。市区町村名だけで試してください。');
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSearching(false);
    }
  }

  function choose(hit: AddressHit) {
    const est = estimateZone(hit.title, hit.position);
    setEstimate(est);
    setHits(null);
    onChange({ address: hit.title, position: hit.position, zone: est.zone });
  }

  function pickOnMap(p: LonLat) {
    const est = estimateZone(value?.address ?? null, p);
    setEstimate(est);
    onChange({ address: value?.address ?? null, position: p, zone: value?.zone ?? est.zone });
  }

  function setZone(zone: ZoneNumber) {
    if (!value) return;
    setEstimate(null);
    onChange({ ...value, zone });
  }

  const xy = value ? toPlaneXY(value.position, value.zone) : null;

  return (
    <section>
      <h2 style={{ fontSize: '1.1rem' }}>対象地</h2>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <input
          aria-label="住所"
          value={query}
          placeholder="例: 埼玉県鴻巣市"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void runSearch();
          }}
          style={{ flex: '1 1 18rem', padding: '0.45rem' }}
        />
        <button type="button" onClick={() => void runSearch()} disabled={searching || query.trim() === ''}>
          {searching ? '検索中…' : '住所を検索'}
        </button>
      </div>
      <p style={{ fontSize: '0.85rem', color: '#555', margin: '0.4rem 0' }}>
        検索は国土地理院の住所検索APIを使います。番地までは出ないことが多いので、
        大まかに寄せてから地図をクリックして位置を調整してください。
      </p>

      {error && <p style={{ color: '#b00' }}>{error}</p>}

      {hits && hits.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: '0.5rem 0', border: '1px solid #ddd' }}>
          {hits.slice(0, 10).map((h, i) => (
            <li key={i} style={{ borderTop: i === 0 ? 'none' : '1px solid #eee' }}>
              <button
                type="button"
                onClick={() => choose(h)}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.5rem', border: 'none', background: 'none', cursor: 'pointer' }}
              >
                {h.title}
                <span style={{ color: '#777', fontSize: '0.85rem' }}>
                  {' '}（{h.position.lat.toFixed(6)}, {h.position.lon.toFixed(6)}）
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div style={{ margin: '0.75rem 0', display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <label>
          背景{' '}
          <select value={tile} onChange={(e) => setTile(e.target.value as GsiTileKey)} style={{ padding: '0.3rem' }}>
            {(Object.keys(GSI_TILES) as GsiTileKey[]).map((k) => (
              <option key={k} value={k}>{GSI_TILES[k].label}</option>
            ))}
          </select>
        </label>
        <span style={{ fontSize: '0.85rem', color: '#555' }}>
          地図は編集用の下敷きです。ズームしても出力縮尺は変わりません。
        </span>
      </div>

      <div style={{ height: '26rem', border: '1px solid #ccc' }}>
        <MapView center={center} zoom={zoom} tile={tile} marker={value?.position ?? null} onClick={pickOnMap} />
      </div>

      {value && (
        <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', border: '1px solid #ccc', background: '#fafafa' }}>
          <h3 style={{ fontSize: '1rem', margin: '0 0 0.5rem' }}>平面直角座標系の確認</h3>

          {estimate && (
            <p
              style={{
                margin: '0 0 0.5rem',
                padding: '0.5rem 0.75rem',
                background: estimate.confidence === 'certain' ? '#eef7ee' : '#fff6e5',
                border: `1px solid ${estimate.confidence === 'certain' ? '#bcd8bc' : '#e8c88a'}`,
              }}
            >
              {estimate.confidence === 'certain' ? '推定（確度高）: ' : '推定（要確認）: '}
              <strong>{zoneLabel(estimate.zone)}</strong>
              <br />
              <span style={{ fontSize: '0.9rem' }}>{estimate.reason}</span>
            </p>
          )}

          <p style={{ margin: '0.5rem 0' }}>
            <label>
              系番号{' '}
              <select
                value={value.zone}
                onChange={(e) => setZone(Number(e.target.value) as ZoneNumber)}
                style={{ padding: '0.35rem' }}
              >
                {ZONE_NUMBERS.map((z) => (
                  <option key={z} value={z}>
                    第{ZONE_DEFINITIONS[z].roman}系（{z}）— {ZONE_DEFINITIONS[z].area}
                  </option>
                ))}
              </select>
            </label>
          </p>

          <p style={{ margin: '0.5rem 0', fontSize: '0.9rem' }}>
            住所: {value.address ?? '（地図上で指定）'}
            <br />
            緯度経度: {value.position.lat.toFixed(6)}, {value.position.lon.toFixed(6)}
            <br />
            平面直角座標: X（北）= {xy!.x.toFixed(3)} m ／ Y（東）= {xy!.y.toFixed(3)} m
          </p>

          <p style={{ margin: 0, fontSize: '0.85rem', color: '#a00' }}>
            系番号を取り違えると座標が数十kmずれます。上の区域の記載と対象地が合っているか確認してください。
          </p>
        </div>
      )}
    </section>
  );
}
