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
import type { LonLat } from '../geo/crs';

export interface MapViewProps {
  center: LonLat;
  zoom: number;
  tile: GsiTileKey;
  /** 地図上に立てる目印。 */
  marker?: LonLat | null;
  /** 地図をクリックしたときに呼ばれる。データが無い区域の概形作図に使う。 */
  onClick?: (p: LonLat) => void;
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

export function MapView({ center, zoom, tile, marker, onClick }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const onClickRef = useRef(onClick);
  onClickRef.current = onClick;

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
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // 初期値のみ使う。以降の変更は下の副作用が反映する。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    mapRef.current?.setStyle(styleFor(tile));
  }, [tile]);

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
