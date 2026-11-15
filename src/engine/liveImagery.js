import { read, write } from '../state/persist.js';

// Port of LiveImagery (audit F26): pick a target region in the briefing and the debrief shows a real NASA picture of it, fetched live from
// NASA Worldview Snapshots (MODIS Terra true colour, 250 m per pixel at best) and shown at your camera's detail. The Lake Manchar floods stay
// bundled so the mission works offline. The service answers cross-origin requests, so the browser can load the picture directly.
export const DEFAULT_ID = 'manchar';
export const LAYER = 'MODIS_Terra_CorrectedReflectance_TrueColor';
export const DATE = '2022-08-28'; // the same flood season as the bundled images, so the comparison is fair
export const SOURCE_RESOLUTION_M = 250;
const KEY = 'tminus.targetRegion';

export const REGIONS = [
  { id: DEFAULT_ID, name: 'Lake Manchar, Sindh (bundled, works offline)' },
  { id: 'karachi', name: 'Karachi and the Indus delta', box: [23.5, 66.0, 25.8, 68.4] },
  { id: 'nile_delta', name: 'Nile delta, Egypt', box: [30.0, 30.0, 32.5, 33.0] },
  { id: 'aral', name: 'Aral Sea, Central Asia', box: [43.5, 58.0, 46.5, 62.0] },
  { id: 'lake_chad', name: 'Lake Chad, Africa', box: [12.0, 13.0, 14.8, 15.8] },
  { id: 'amazon_mouth', name: 'Amazon river mouth, Brazil', box: [-2.0, -52.0, 1.0, -48.0] },
  { id: 'karakoram', name: 'Karakoram glaciers, Pakistan', box: [35.0, 75.0, 37.5, 78.0] },
];
export const regionById = (id) => REGIONS.find((r) => r.id === id) ?? REGIONS[0];
export const selectedRegion = () => regionById(read(KEY, DEFAULT_ID));
export const selectRegion = (id) => write(KEY, regionById(id).id);
export const isBundled = (r) => r.id === DEFAULT_ID;

/** The Worldview snapshot address (EPSG:4326 boxes are written south, west, north, east). */
export const imageUrl = (r, pixels) =>
  `https://wvs.earthdata.nasa.gov/api/v1/snapshot?REQUEST=GetSnapshot&LAYERS=${LAYER}&CRS=EPSG:4326&TIME=${DATE}&BBOX=${r.box.join(',')}&FORMAT=image/jpeg&WIDTH=${pixels}&HEIGHT=${pixels}`;

/** Loads the picture; resolves to an HTMLImageElement or null (offline, or the service says no). */
export function fetchImage(region, pixels = 512) {
  return new Promise((resolve) => {
    const img = new Image(); img.crossOrigin = 'anonymous';
    const timer = setTimeout(() => resolve(null), 20000);
    img.onload = () => { clearTimeout(timer); resolve(img); };
    img.onerror = () => { clearTimeout(timer); resolve(null); };
    img.src = imageUrl(region, pixels);
  });
}
