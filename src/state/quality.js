import { useGame } from './store.js';

// Graphics presets (the original had a graphics tuning menu). High = bloom, MSAA, shadows, clouds, particles. Low is for old laptops, phones and tests.
export const QUALITY = {
  high: { key: 'high', dpr: [1, 1.75], shadows: true, bloom: true, msaa: 4, particles: 1, clouds: true, segments: 128, label: 'High' },
  medium: { key: 'medium', dpr: [1, 1.25], shadows: true, bloom: true, msaa: 0, particles: 0.6, clouds: true, segments: 64, label: 'Medium' },
  low: { key: 'low', dpr: [0.5, 0.7], shadows: false, bloom: false, msaa: 0, particles: 0.25, clouds: false, segments: 32, label: 'Low' },
};
export const useQuality = () => QUALITY[useGame((s) => s.settings.quality)] ?? QUALITY.high;

/** A sensible first-run preset: phones get Low, tablets / touch laptops Medium, desktops High. The player can change it in Settings. */
export function defaultQuality() {
  try {
    const coarse = window.matchMedia?.('(pointer: coarse)').matches; const w = Math.min(window.innerWidth, window.innerHeight);
    const cores = navigator.hardwareConcurrency ?? 8; const mem = navigator.deviceMemory ?? 8;
    if (coarse && w < 600) return 'low';
    if (coarse || cores <= 4 || mem <= 4) return 'medium';
  } catch { /* ignore */ }
  return 'high';
}
