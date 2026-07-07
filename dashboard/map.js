// MapLibre coverage map; draws the community roads/potholes for the selected
// month window via shared_layer_months. Basemap: a CORS-friendly hosted dark
// style (CARTO, no key) for context — the app's Serbia PMTiles are a GitHub
// release asset streamed natively, which hits range-request/CORS limits in a
// browser, so the web page uses a hosted style. The coverage overlay is identical.
const STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

// Decode "lat,lng;lat,lng;…" (the app's geometry_enc codec) to [ [lng,lat], … ].
function decode(enc) {
  return enc.split(';').map((p) => { const [la, lo] = p.split(','); return [+lo, +la]; });
}
// r.quality is the app's roughness value (contrib_segments.quality, 0..10), NOT a
// normalized goodness score. Mirror lib/ui/roughness_color.dart's kIriGradient:
// roughness 0.3 -> green (smooth) .. 1.2 -> red (rough), green->yellow->red.
const ROUGHNESS_LOW = 0.3, ROUGHNESS_HIGH = 1.2;
const color = (q) => {
  const t = Math.max(0, Math.min(1, (q - ROUGHNESS_LOW) / (ROUGHNESS_HIGH - ROUGHNESS_LOW)));
  return `hsl(${Math.round(120 * (1 - t))},70%,45%)`; // t=0 smooth=green, t=1 rough=red
};

let cfg = {};
export function initMap(el, sbUrl, anon) {
  cfg = { sbUrl, anon };
  const map = new maplibregl.Map({ container: el, style: STYLE, center: [19.61, 44.98], zoom: 8 });
  map.on('load', () => {
    map.addSource('roads', { type: 'geojson', data: { type:'FeatureCollection', features:[] } });
    map.addLayer({ id:'roads', type:'line', source:'roads',
      paint:{ 'line-color':['get','color'], 'line-width':3, 'line-opacity':0.85 } });
    map.addSource('holes', { type: 'geojson', data: { type:'FeatureCollection', features:[] } });
    map.addLayer({ id:'holes', type:'circle', source:'holes',
      paint:{ 'circle-radius':4, 'circle-color':'#f97316', 'circle-opacity':0.9 } });
    map._ready = true;
    if (map._holesVisible === false) map.setLayoutProperty('holes', 'visibility', 'none');
    if (map._pending) setWindow(map, ...map._pending);
  });
  map.on('moveend', () => map._win && setWindow(map, ...map._win));
  return map;
}

// Show/hide the pothole layer. Records intent even before the style loads so an
// initial toggle applies once the 'holes' layer exists (see the load handler).
export function setPotholesVisible(map, visible) {
  map._holesVisible = visible;
  if (map._ready) map.setLayoutProperty('holes', 'visibility', visible ? 'visible' : 'none');
}

export async function setWindow(map, from, to) {
  map._win = [from, to];
  if (!map._ready) { map._pending = [from, to]; return; }
  const b = map.getBounds();
  const url = `${cfg.sbUrl}/rest/v1/rpc/shared_layer_months`;
  const body = JSON.stringify({
    min_lng: b.getWest(), min_lat: b.getSouth(),
    max_lng: b.getEast(), max_lat: b.getNorth(),
    from_month: from, to_month: to,
  });
  let data;
  try {
    data = await fetch(url, { method:'POST',
      headers:{ apikey: cfg.anon, 'Content-Type':'application/json' }, body }).then(r => r.json());
  } catch { return; } // map stays; degrade gracefully
  map.getSource('roads')?.setData({ type:'FeatureCollection', features:
    (data.roads || []).map(r => ({ type:'Feature',
      properties:{ color: color(r.quality) },
      geometry:{ type:'LineString', coordinates: decode(r.geometry) } })) });
  map.getSource('holes')?.setData({ type:'FeatureCollection', features:
    (data.potholes || []).map(p => ({ type:'Feature', properties:{},
      geometry:{ type:'Point', coordinates:[p.lng, p.lat] } })) });
}
