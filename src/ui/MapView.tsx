/**
 * 編集用の地図ビュー。
 *
 * **この地図は下敷きである。** 表示倍率は出力縮尺と一切連動しない
 * （CLAUDE.md「絶対に守る制約」4）。ズームしてもPDFは変わらない。
 * 地理院タイルはここでしか使わず、PDFには焼き込まない。
 */

import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { GSI_TILES, GSI_ATTRIBUTION, GsiTileKey } from '../data/gsi';
import type { Feature, FeatureCollection } from 'geojson';
import type { LonLat } from '../geo/crs';

export interface MapViewProps {
  center: LonLat;
  zoom: number;
  tile: GsiTileKey;
  /** 地図上に立てる目印。 */
  marker?: LonLat | null;
  /** 地図をクリックしたときに呼ばれる。データが無い区域の概形作図に使う。 */
  onClick?: (p: LonLat) => void;
  /** なぞっている最中の概形。頂点と辺を重ねて表示する。 */
  trace?: readonly LonLat[];
}

const TRACE_SOURCE = 'trace';

/** なぞった点列を、面・線・頂点の3レイヤぶんのGeoJSONにする。 */
function traceData(trace: readonly LonLat[]): FeatureCollection {
  const coords = trace.map((p) => [p.lon, p.lat] as [number, number]);
  const features: Feature[] = trace.map((p, i) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
    properties: { index: i + 1 },
  }));
  if (coords.length >= 2) {
    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: coords.length >= 3 ? [...coords, coords[0]] : coords },
      properties: {},
    });
  }
  if (coords.length >= 3) {
    features.push({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [[...coords, coords[0]]] },
      properties: {},
    });
  }
  return { type: 'FeatureCollection', features };
}

function styleFor(tile: GsiTileKey): maplibregl.StyleSpecification {
  const t = GSI_TILES[tile];
  return {
    version: 8,
    sources: {
      gsi: {
        type: 'raster',
        tiles: [t.url],
        tileSize: 256,
        maxzoom: t.maxZoom,
        attribution: GSI_ATTRIBUTION,
      },
    },
    layers: [{ id: 'gsi', type: 'raster', source: 'gsi' }],
  };
}

export function MapView({ center, zoom, tile, marker, onClick, trace }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const onClickRef = useRef(onClick);
  onClickRef.current = onClick;
  const traceRef = useRef(trace);
  traceRef.current = trace;

  /** 概形のレイヤを（無ければ）作る。setStyle でスタイルを差し替えると消えるので毎回呼ぶ。 */
  function ensureTraceLayers(map: maplibregl.Map) {
    if (map.getSource(TRACE_SOURCE)) return;
    map.addSource(TRACE_SOURCE, { type: 'geojson', data: traceData(traceRef.current ?? []) });
    map.addLayer({
      id: 'trace-fill', type: 'fill', source: TRACE_SOURCE,
      filter: ['==', ['geometry-type'], 'Polygon'],
      paint: { 'fill-color': '#c0392b', 'fill-opacity': 0.18 },
    });
    map.addLayer({
      id: 'trace-line', type: 'line', source: TRACE_SOURCE,
      filter: ['==', ['geometry-type'], 'LineString'],
      paint: { 'line-color': '#c0392b', 'line-width': 2 },
    });
    map.addLayer({
      id: 'trace-point', type: 'circle', source: TRACE_SOURCE,
      filter: ['==', ['geometry-type'], 'Point'],
      paint: {
        'circle-radius': 5, 'circle-color': '#fff',
        'circle-stroke-color': '#c0392b', 'circle-stroke-width': 2,
      },
    });
  }

  // 地図の生成は一度だけ。以後は命令的に操作する。
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: styleFor(tile),
      center: [center.lon, center.lat],
      zoom,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');
    map.on('click', (e: maplibregl.MapMouseEvent) =>
      onClickRef.current?.({ lon: e.lngLat.lng, lat: e.lngLat.lat }),
    );
    map.on('load', () => ensureTraceLayers(map));
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // 初期値のみ使う。以降の変更は下の副作用が反映する。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setStyle(styleFor(tile));
    // スタイルを差し替えるとソースもレイヤも消える。読み込み直後に作り直す。
    map.once('styledata', () => ensureTraceLayers(map));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tile]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const src = map.getSource(TRACE_SOURCE) as maplibregl.GeoJSONSource | undefined;
    src?.setData(traceData(trace ?? []));
  }, [trace]);

  useEffect(() => {
    mapRef.current?.easeTo({ center: [center.lon, center.lat], zoom, duration: 600 });
  }, [center.lon, center.lat, zoom]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!marker) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }
    if (!markerRef.current) {
      // setLngLat を addTo より先に呼ぶ。位置が未設定のまま addTo すると
      // MapLibre 内部で lngLat を読んで落ちる。
      markerRef.current = new maplibregl.Marker({ color: '#c00' })
        .setLngLat([marker.lon, marker.lat])
        .addTo(map);
      return;
    }
    markerRef.current.setLngLat([marker.lon, marker.lat]);
  }, [marker]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}
