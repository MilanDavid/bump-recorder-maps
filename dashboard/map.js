// Full-screen MapLibre map that reproduces the mobile app's look: the Protomaps
// dark basemap (streamed from a PMTiles archive) with community roads (green->red
// by roughness) and pothole badges (orange, sized by report count) drawn on top.
//
// The map is created ONCE and only its GeoJSON sources are updated — opening the
// drawer/filter never touches it. Data refetches only on pan/zoom (moveend) or a
// filter-value change, both debounced.

// ---- config -----------------------------------------------------------------
// The app's Serbia basemap, served from a CORS-enabled, byte-range host. The
// GitHub release asset is CORS-blocked and 597 MB won't fit on Pages, so this
// must point at e.g. a Cloudflare R2 public URL. Set this and the exact
// mobile basemap appears; leave it blank to fall back to a hosted dark style.
const PMTILES_URL = ''; // e.g. 'https://<bucket>.r2.dev/serbia.pmtiles'
const FALLBACK_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

// ---- mobile-identical styling ----------------------------------------------
// Road color mirrors lib/ui/roughness_color.dart with kIriGradient (low 0.3,
// high 1.2): green #4CAF50 -> yellow #FFEB3B (at 0.75) -> red #F44336.
const ROAD_COLOR = [
  'interpolate', ['linear'], ['get', 'quality'],
  0.3, '#4CAF50', 0.75, '#FFEB3B', 1.2, '#F44336',
];
// Pothole badge radius mirrors potholeBadgeSize() (diameter -> radius): 1->13,
// grows with the report count, capped ~21.
const HOLE_RADIUS = [
  'interpolate', ['linear'], ['get', 'reports'], 1, 13, 2, 16, 12, 21,
];
// Count label: the number when >1 (99+ capped), a "!" for a single report
// (mirrors the app's warning glyph).
const HOLE_LABEL = [
  'case',
  ['<=', ['get', 'reports'], 1], '!',
  ['>', ['get', 'reports'], 99], '99+',
  ['to-string', ['get', 'reports']],
];

// Decode "lat,lng;lat,lng;…" (the app's geometry_enc codec) to [ [lng,lat], … ].
function decode(enc) {
  return enc.split(';').map((p) => { const [la, lo] = p.split(','); return [+lo, +la]; });
}

let cfg = {};

export async function initMap(el, sbUrl, anon) {
  cfg = { sbUrl, anon };
  let style = FALLBACK_STYLE;
  if (PMTILES_URL) {
    const proto = new pmtiles.Protocol();
    maplibregl.addProtocol('pmtiles', proto.tile);
    // Load the app's dark style and point its vector source at the PMTiles.
    style = await fetch('./protomaps-dark.json').then((r) => r.json());
    style.sources.protomaps.url = 'pmtiles://' + PMTILES_URL;
  }
  const map = new maplibregl.Map({
    container: el,
    style,
    center: [19.61, 44.98], // Serbia
    zoom: 8,
    attributionControl: false,
  });
  map.addControl(
    new maplibregl.AttributionControl({
      compact: true,
      customAttribution: '© OpenStreetMap · Protomaps',
    }),
  );
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
  map._mode = 'all'; // 'all' -> shared_layer | 'window' -> shared_layer_months
  map.on('load', () => {
    map.addSource('roads', { type: 'geojson', data: empty() });
    map.addLayer({
      id: 'roads', type: 'line', source: 'roads',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ROAD_COLOR,
        'line-width': ['interpolate', ['linear'], ['zoom'], 8, 2, 12, 4, 16, 6],
        'line-opacity': 0.9,
      },
    });
    map.addSource('holes', { type: 'geojson', data: empty() });
    map.addLayer({
      id: 'holes', type: 'circle', source: 'holes',
      paint: {
        'circle-radius': HOLE_RADIUS,
        'circle-color': '#FF5722',
        'circle-opacity': 0.9,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 2,
      },
    });
    map.addLayer({
      id: 'holes-count', type: 'symbol', source: 'holes',
      layout: {
        'text-field': HOLE_LABEL,
        'text-font': ['Noto Sans Regular'],
        'text-size': 13,
        'text-allow-overlap': true,
      },
      paint: { 'text-color': '#ffffff' },
    });
    map._ready = true;
    if (map._holesVisible === false) setPotholesVisible(map, false);
    scheduleLoad(map);
  });
  map.on('moveend', () => scheduleLoad(map));
  return map;
}

const empty = () => ({ type: 'FeatureCollection', features: [] });

export function setPotholesVisible(map, visible) {
  map._holesVisible = visible;
  if (!map._ready) return;
  const v = visible ? 'visible' : 'none';
  map.setLayoutProperty('holes', 'visibility', v);
  map.setLayoutProperty('holes-count', 'visibility', v);
}

// Time-travel: switch to the month-window layer for [from,to]. Called ONLY when
// the filter value changes (not when the panel opens/closes).
export function applyWindow(map, from, to) {
  map._mode = 'window';
  map._from = from;
  map._to = to;
  scheduleLoad(map);
}

// Back to the all-time layer (mobile-identical), e.g. on logout / filter clear.
export function clearWindow(map) {
  map._mode = 'all';
  scheduleLoad(map);
}

let _timer;
function scheduleLoad(map) {
  clearTimeout(_timer);
  _timer = setTimeout(() => loadData(map), 200);
}

async function loadData(map) {
  if (!map._ready) return;
  const b = map.getBounds();
  const bbox = {
    min_lng: b.getWest(), min_lat: b.getSouth(),
    max_lng: b.getEast(), max_lat: b.getNorth(),
  };
  const isWindow = map._mode === 'window' && map._from && map._to;
  const rpc = isWindow ? 'shared_layer_months' : 'shared_layer';
  const body = isWindow
    ? { ...bbox, from_month: map._from, to_month: map._to }
    : bbox;
  let data;
  try {
    data = await fetch(`${cfg.sbUrl}/rest/v1/rpc/${rpc}`, {
      method: 'POST',
      headers: { apikey: cfg.anon, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then((r) => r.json());
  } catch { return; } // map stays; degrade gracefully
  map.getSource('roads')?.setData({
    type: 'FeatureCollection',
    features: (data.roads || []).map((r) => ({
      type: 'Feature',
      properties: { quality: r.quality },
      geometry: { type: 'LineString', coordinates: decode(r.geometry) },
    })),
  });
  map.getSource('holes')?.setData({
    type: 'FeatureCollection',
    features: (data.potholes || []).map((p) => ({
      type: 'Feature',
      properties: { reports: p.reports },
      geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
    })),
  });
}
