// 3D map of the demo water network drawn over real satellite imagery, terrain and water bodies.
// The network itself is fictional: the seed stays a 1000 x 1000 m schematic plan, and MAP_ANCHOR
// only decides where that plan is drawn for display. Nothing here implies real assets at this place.
import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { seed, riskFor, HOME_VILLAGE, CITIZEN_AREA } from '../data/seed';
import { areaStatus, S, visibleComplaints } from '../demo/steps';
import { MAP_ANCHOR } from '../data/mapAnchor';
import { fieldLayout, HEALTH } from '../data/fieldLayout';


const M_PER_DEG = 111320;
const COS_LAT = Math.cos((MAP_ANCHOR.lat * Math.PI) / 180);
/** Plan metres (x east, y north) to [lng, lat]. */
const toLngLat = ([x, y]) => [MAP_ANCHOR.lon + x / (M_PER_DEG * COS_LAT), MAP_ANCHOR.lat + y / M_PER_DEG];
// Looking north, with the village tank on the east bank of the network.
const CENTRE = toLngLat([640, 520]);

const ZONE_COLOR = { normal: '#38BDF8', warning: '#F59E0B', problem: '#EF4444' };
const BAND_COLOR = { HIGH: '#EF4444', MEDIUM: '#F59E0B', LOW: '#38BDF8' };
const POINT_LABEL = { source: 'S', pump: 'P', tank: 'T', valve: 'V' };
// Markers stay fully visible: on this flat terrain MapLibre's occlusion test fades markers that are in plain view.
const POINT_NAME = { source: 'Borewell', pump: 'Pump house', tank: 'Overhead tank', valve: 'Valve' };

// Marching dashes make water look like it is moving through pipes and streams.
const DASH_STEPS = [
  [0, 4, 3], [0.5, 4, 2.5], [1, 4, 2], [1.5, 4, 1.5], [2, 4, 1], [2.5, 4, 0.5], [3, 4, 0],
  [0, 0.5, 3, 3.5], [0, 1, 3, 3], [0, 1.5, 3, 2.5], [0, 2, 3, 2], [0, 2.5, 3, 1.5], [0, 3, 3, 1], [0, 3.5, 3, 0.5],
];
const FLOW_LAYERS = ['pipes-flow', 'waterway-flow'];

const STYLE = {
  version: 8,
  sources: {
    satellite: {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      maxzoom: 19,
      attribution: 'Imagery © Esri, Maxar, Earthstar Geographics',
    },
    dem: {
      type: 'raster-dem',
      tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
      encoding: 'terrarium',
      tileSize: 256,
      maxzoom: 15,
      attribution: 'Terrain: Mapzen / AWS Terrain Tiles',
    },
    shade: {
      type: 'raster-dem',
      tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
      encoding: 'terrarium',
      tileSize: 256,
      maxzoom: 15,
    },
    osm: {
      type: 'vector',
      url: 'https://tiles.openfreemap.org/planet',
      attribution: '© OpenMapTiles © OpenStreetMap contributors',
    },
  },
  layers: [
    { id: 'satellite', type: 'raster', source: 'satellite', paint: { 'raster-saturation': -0.15, 'raster-contrast': 0.08 } },
    { id: 'hillshade', type: 'hillshade', source: 'shade', paint: { 'hillshade-exaggeration': 0.25, 'hillshade-shadow-color': '#0E2A38' } },
    // Real lakes, tanks and canals from OpenStreetMap, tinted so the waterscape stands out.
    { id: 'water-fill', type: 'fill', source: 'osm', 'source-layer': 'water', paint: { 'fill-color': '#22D3EE', 'fill-opacity': 0.28 } },
    { id: 'water-edge', type: 'line', source: 'osm', 'source-layer': 'water', paint: { 'line-color': '#A5F3FC', 'line-width': 1.5, 'line-opacity': 0.9 } },
    { id: 'waterway', type: 'line', source: 'osm', 'source-layer': 'waterway', paint: { 'line-color': '#22D3EE', 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 1.5, 17, 5], 'line-opacity': 0.8 } },
    { id: 'waterway-flow', type: 'line', source: 'osm', 'source-layer': 'waterway', paint: { 'line-color': '#ECFEFF', 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.8, 17, 2.5], 'line-dasharray': DASH_STEPS[0] } },
  ],
  terrain: { source: 'dem', exaggeration: 1.6 },
};

function overlayData({ step, mode, selected }) {
  const zones = seed.service_areas.filter((a) => a.village_id === HOME_VILLAGE);
  const assetList = seed.assets.filter((a) => zones.some((z) => z.id === a.service_area_id));
  const complaints = visibleComplaints(step).filter((c) => Number.isFinite(c.location?.x));

  const zoneFeatures = zones.map((z) => {
    const ring = z.polygon.map(toLngLat);
    return {
      type: 'Feature',
      properties: { id: z.id, color: ZONE_COLOR[areaStatus(step, z.id).level] },
      geometry: { type: 'Polygon', coordinates: [[...ring, ring[0]]] },
    };
  });

  const pipeFeatures = assetList
    .filter((a) => a.geometry.line)
    .map((a) => {
      const band = riskFor(a.id)?.band ?? 'LOW';
      return {
        type: 'Feature',
        properties: {
          id: a.id,
          color: mode === 'citizen' ? BAND_COLOR.LOW : BAND_COLOR[band],
          width: a.id === selected ? 9 : band === 'HIGH' && mode !== 'citizen' ? 7 : 5,
        },
        geometry: { type: 'LineString', coordinates: a.geometry.line.map(toLngLat) },
      };
    });

  let cluster = [];
  if (complaints.length > 0 && step < S.VERIFIED) {
    const cx = complaints.reduce((s, c) => s + c.location.x, 0) / complaints.length;
    const cy = complaints.reduce((s, c) => s + c.location.y, 0) / complaints.length;
    cluster = [{ type: 'Feature', properties: { count: complaints.length }, geometry: { type: 'Point', coordinates: toLngLat([cx, cy]) } }];
  }

  return {
    zones: { type: 'FeatureCollection', features: zoneFeatures },
    pipes: { type: 'FeatureCollection', features: pipeFeatures },
    cluster: { type: 'FeatureCollection', features: cluster },
    zoneList: zones,
    pointAssets: assetList.filter((a) => a.geometry.point),
    lineAssets: assetList.filter((a) => a.geometry.line),
    clusterAt: cluster[0]?.geometry.coordinates,
    complaintCount: complaints.length,
  };
}

const esc = (text) => String(text).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function el(className, html) {
  const node = document.createElement('div');
  node.className = className;
  node.innerHTML = html;
  return node;
}

/** setPaintProperty throws while the style is still settling (e.g. terrain loading); retry when idle. */
function paint(map, layer, prop, value) {
  if (!map.getLayer(layer)) return;
  try {
    map.setPaintProperty(layer, prop, value);
  } catch {
    map.once('idle', () => paint(map, layer, prop, value));
  }
}

const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function housesGeoJson() {
  return {
    type: 'FeatureCollection',
    features: fieldLayout().houses.map((h) => {
      const ring = h.polygon.map(toLngLat);
      return { type: 'Feature', properties: { id: h.id, height: h.height }, geometry: { type: 'Polygon', coordinates: [[...ring, ring[0]]] } };
    }),
  };
}

// How strongly the network shows in each view. The sensor view fades it so sensor health stands out.
const VIEW_PAINT = {
  network: { 'zones-fill': ['fill-opacity', 0.22], pipes: ['line-opacity', 1], 'pipes-casing': ['line-opacity', 0.55], 'pipes-flow': ['line-opacity', 0.85], 'houses-3d': ['fill-extrusion-opacity', 0.92] },
  sensors: { 'zones-fill': ['fill-opacity', 0.07], pipes: ['line-opacity', 0.35], 'pipes-casing': ['line-opacity', 0.2], 'pipes-flow': ['line-opacity', 0.25], 'houses-3d': ['fill-extrusion-opacity', 0.6] },
};

/**
 * Props: step (demo story step), mode ('gp' | 'citizen'), selected asset id, onSelect(assetId),
 * liveNodes (sensor node health from the API), onFail() when the map cannot load (offline, no WebGL),
 * view ('network' | 'sensors'), sensors (field sensors with health), statusFilter (states to show),
 * selectedSensor (code) and onSelectSensor(code).
 */
export default function TerrainMap({ step, mode = 'gp', selected, onSelect, liveNodes, onFail, view = 'network', sensors = [], statusFilter, selectedSensor, onSelectSensor }) {
  const box = useRef(null);
  const mapRef = useRef(null);
  const markers = useRef({});
  const sensorMarkers = useRef({});
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onSelectSensorRef = useRef(onSelectSensor);
  onSelectSensorRef.current = onSelectSensor;
  const [ready, setReady] = useState(false);

  // Create the map once.
  useEffect(() => {
    let map;
    try {
      map = new maplibregl.Map({
        container: box.current,
        style: STYLE,
        center: CENTRE,
        zoom: 15.7,
        pitch: 55,
        bearing: 18,
        maxPitch: 75,
        attributionControl: { compact: true },
        cooperativeGestures: false,
      });
    } catch {
      onFail?.();
      return undefined;
    }
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');

    // Fall back to the schematic when imagery fails (offline, blocked tiles) or the style never loads.
    // Slow connections just load slowly: only real failures count.
    let gotImagery = false;
    let tileErrors = 0;
    let styleLoaded = false;
    map.on('sourcedata', (e) => {
      if (e.sourceId === 'satellite' && (e.tile || e.isSourceLoaded)) gotImagery = true;
    });
    map.on('error', (e) => {
      if (e.sourceId === 'satellite' && !gotImagery && ++tileErrors >= 4) onFail?.();
      else if (!e.sourceId) console.warn('Map:', e.error?.message ?? e);
    });
    const giveUp = setTimeout(() => !styleLoaded && onFail?.(), 30000);

    // Overlays go on as soon as the style is parsed, without waiting for every tile.
    map.once('style.load', () => {
      styleLoaded = true;
      map.addSource('zones', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addSource('pipes', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addSource('cluster', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addSource('houses', { type: 'geojson', data: housesGeoJson() });

      // Fictional homes, one per household in the zone register, as small 3D blocks.
      map.addLayer({
        id: 'houses-3d',
        type: 'fill-extrusion',
        source: 'houses',
        paint: {
          'fill-extrusion-color': ['interpolate', ['linear'], ['get', 'height'], 3.5, '#E9E1D0', 6.5, '#F8F4EC'],
          'fill-extrusion-height': ['get', 'height'],
          'fill-extrusion-opacity': 0.92,
        },
      });

      // Flat tints: 3D blocks would sit on top of the pipes and wash them out.
      map.addLayer({
        id: 'zones-fill',
        type: 'fill',
        source: 'zones',
        paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.22 },
      });
      map.addLayer({
        id: 'zones-edge',
        type: 'line',
        source: 'zones',
        paint: { 'line-color': ['get', 'color'], 'line-width': 2, 'line-dasharray': [3, 2] },
      });
      map.addLayer({
        id: 'cluster',
        type: 'circle',
        source: 'cluster',
        paint: {
          'circle-color': '#EF4444',
          'circle-opacity': 0.18,
          'circle-stroke-color': '#EF4444',
          'circle-stroke-width': 2,
          'circle-pitch-alignment': 'map',
          // About 95 m on the ground (approximate location, 1 km precision is shown as a soft area).
          'circle-radius': ['interpolate', ['exponential', 2], ['zoom'], 14, 10.5, 18, 168],
        },
      });
      map.addLayer({
        id: 'pipes-casing',
        type: 'line',
        source: 'pipes',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#0B1118', 'line-width': ['+', ['get', 'width'], 4], 'line-opacity': 0.55 },
      });
      map.addLayer({
        id: 'pipes',
        type: 'line',
        source: 'pipes',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': ['get', 'color'], 'line-width': ['get', 'width'] },
      });
      map.addLayer({
        id: 'pipes-flow',
        type: 'line',
        source: 'pipes',
        layout: { 'line-cap': 'round' },
        paint: { 'line-color': '#FFFFFF', 'line-width': 2, 'line-opacity': 0.85, 'line-dasharray': DASH_STEPS[0] },
      });
      map.addLayer({
        id: 'pipes-hit',
        type: 'line',
        source: 'pipes',
        paint: { 'line-color': '#000000', 'line-width': 24, 'line-opacity': 0 },
      });

      map.on('click', 'pipes-hit', (e) => onSelectRef.current?.(e.features[0].properties.id));
      map.on('mouseenter', 'pipes-hit', () => (map.getCanvas().style.cursor = onSelectRef.current ? 'pointer' : ''));
      map.on('mouseleave', 'pipes-hit', () => (map.getCanvas().style.cursor = ''));
      setReady(true);
    });

    // Flowing water animation, about 12 steps a second.
    let frame = 0;
    let stepIndex = 0;
    let last = 0;
    const animate = (t) => {
      if (t - last > 80) {
        last = t;
        stepIndex = (stepIndex + 1) % DASH_STEPS.length;
        if (map.style?._loaded) FLOW_LAYERS.forEach((id) => paint(map, id, 'line-dasharray', DASH_STEPS[stepIndex]));
      }
      frame = requestAnimationFrame(animate);
    };
    if (!prefersReducedMotion()) frame = requestAnimationFrame(animate);

    return () => {
      clearTimeout(giveUp);
      cancelAnimationFrame(frame);
      [markers, sensorMarkers].forEach((ref) => {
        Object.values(ref.current).forEach((m) => m.remove());
        ref.current = {};
      });
      map.remove();
      mapRef.current = null;
    };
  }, [onFail]);

  // Dim the imagery a little in dark mode so overlays keep their contrast.
  useEffect(() => {
    if (!ready) return undefined;
    const map = mapRef.current;
    const apply = () => paint(map, 'satellite', 'raster-brightness-max', document.documentElement.classList.contains('dark') ? 0.7 : 1);
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, [ready]);

  // Push the current story state, risk and live sensor health onto the map.
  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current;
    const d = overlayData({ step, mode, selected });
    map.getSource('zones').setData(d.zones);
    map.getSource('pipes').setData(d.pipes);
    map.getSource('cluster').setData(d.cluster);

    const keep = new Set();
    const put = (key, lngLat, build, update) => {
      keep.add(key);
      let m = markers.current[key];
      if (!m) {
        m = new maplibregl.Marker({ element: build(), anchor: 'bottom', opacityWhenCovered: '1' }).setLngLat(lngLat).addTo(map);
        markers.current[key] = m;
      } else {
        m.setLngLat(lngLat);
      }
      update?.(m.getElement());
    };

    d.zoneList.forEach((z) => {
      const xs = z.polygon.map((p) => p[0]);
      const ys = z.polygon.map((p) => p[1]);
      const at = toLngLat([Math.min(...xs) + 60, Math.max(...ys) - 40]);
      const you = mode === 'citizen' && z.id === CITIZEN_AREA;
      put(`zone-${z.id}`, at, () => el('map-chip map-chip--zone', ''), (node) => {
        const level = areaStatus(step, z.id).level;
        node.innerHTML = `<span class="map-dot" style="background:${ZONE_COLOR[level]}"></span>${esc(z.name)}${you ? ' · you' : ''}`;
      });
    });

    d.pointAssets.forEach((a) => {
      put(`asset-${a.id}`, toLngLat(a.geometry.point), () =>
        el('map-pin', `<span>${esc(POINT_LABEL[a.type] ?? '?')}</span>`),
      (node) => (node.title = `${POINT_NAME[a.type] ?? a.type} · ${a.code}`));
    });

    if (mode !== 'citizen') {
      d.lineAssets.forEach((a) => {
        const line = a.geometry.line;
        const mid = line[Math.floor(line.length / 2)];
        put(`pipe-${a.id}`, toLngLat(mid), () => {
          const node = el('map-chip map-chip--pipe', esc(a.code));
          node.addEventListener('click', () => onSelectRef.current?.(a.id));
          return node;
        }, (node) => {
          const band = riskFor(a.id)?.band ?? 'LOW';
          node.style.borderColor = BAND_COLOR[band];
          node.classList.toggle('is-selected', a.id === selected);
        });
      });

      seed.sensor_nodes.forEach((n) => {
        const asset = seed.assets.find((a) => a.id === n.asset_id);
        const p = asset.geometry.point ?? asset.geometry.line.at(-1);
        put(`node-${n.id}`, toLngLat(p), () => el('map-sensor', ''), (node) => {
          const status = liveNodes?.find((x) => x.id === n.id)?.status ?? 'scripted';
          node.dataset.status = status;
          node.innerHTML = `<span class="map-sensor__pulse"></span><span class="map-sensor__label">${esc(n.code)} · ${{ online: 'online', offline: 'offline', never_reported: 'no data', scripted: 'sensor' }[status]}</span>`;
        });
      });
    }

    if (d.clusterAt) {
      put('cluster', d.clusterAt, () => el('map-chip map-chip--alert', ''), (node) => {
        node.textContent = mode === 'citizen' ? 'Your report (approx. area)' : `${d.complaintCount} complaints (approx.)`;
      });
    }

    Object.keys(markers.current).forEach((key) => {
      if (!keep.has(key)) {
        markers.current[key].remove();
        delete markers.current[key];
      }
    });
  }, [ready, step, mode, selected, liveNodes]);

  // Fade the network in the sensor view; hide pipe labels and node pins there (CSS on the container).
  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current;
    // Toggled directly: MapLibre owns the container's other classes, so React must not rewrite className.
    box.current.classList.toggle('is-sensor-view', view === 'sensors');
    Object.entries(VIEW_PAINT[view] ?? VIEW_PAINT.network).forEach(([layer, [prop, value]]) => paint(map, layer, prop, value));
  }, [ready, view]);

  // Sensor health markers, only in the sensor view.
  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current;
    const shown = view === 'sensors' ? sensors.filter((s) => !statusFilter || statusFilter.includes(s.status)) : [];
    const keep = new Set(shown.map((s) => s.code));
    shown.forEach((s) => {
      let m = sensorMarkers.current[s.code];
      if (!m) {
        const node = document.createElement('button');
        node.type = 'button';
        node.className = 'map-health';
        node.addEventListener('click', (e) => {
          e.stopPropagation();
          onSelectSensorRef.current?.(s.code);
        });
        m = new maplibregl.Marker({ element: node, anchor: 'center', opacityWhenCovered: '1' }).setLngLat(toLngLat(s.at)).addTo(map);
        sensorMarkers.current[s.code] = m;
      }
      const node = m.getElement();
      node.dataset.status = s.status;
      node.classList.toggle('is-selected', s.code === selectedSensor);
      node.setAttribute('aria-label', `${s.code}, ${s.kindLabel}: ${HEALTH[s.status].label}`);
      node.innerHTML = `<span class="map-health__dot"></span><span class="map-health__label">${esc(s.code)}</span>`;
    });
    Object.keys(sensorMarkers.current).forEach((code) => {
      if (!keep.has(code)) {
        sensorMarkers.current[code].remove();
        delete sensorMarkers.current[code];
      }
    });
  }, [ready, view, sensors, statusFilter, selectedSensor]);

  return <div ref={box} className="h-full w-full" role="region" aria-label="3D map of the demo water network on real terrain" />;
}
