import { writable, get } from 'svelte/store';
import { topCelestialEvent } from './celestialDates';
import PALETTES_JSON from './themes.json';

const PALETTES = PALETTES_JSON as Record<string, Record<string, string>>;

export interface EnvThemeState {
  themeName: string;
  activePal: string; // the palette KEY in force (incl. overrides): 'storm', 'sweet', 'night_full', 'custom'…
  solarPhase: string;
  lunarPhase: string;
  lunarPhaseName: string;
  lunarCycle: number;
  weatherOverride: string | null;
  celestialEvent: string | null;
  cssVars: Record<string, string>;
  isStorm: boolean;
  isMeteorShower: boolean;
  isAurora: boolean;
  isStars: boolean;
  // 'sweet' is choice-only: no solar/lunar/weather trigger ever selects it,
  // it exists purely as a dropdown pick — petals fall when it's chosen.
  isPetals: boolean;
}

const DEFAULT_STATE: EnvThemeState = {
  themeName: 'day',
  activePal: 'day',
  solarPhase: 'day',
  lunarPhase: 'new',
  lunarPhaseName: 'New Moon',
  lunarCycle: 0,
  weatherOverride: null,
  celestialEvent: null,
  cssVars: {},
  isStorm: false,
  isMeteorShower: false,
  isAurora: false,
  isStars: false,
  isPetals: false,
};

export const envThemeState = writable<EnvThemeState>(DEFAULT_STATE);

function getInitialDebugOverride(): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    if (localStorage.getItem('radial-planner-custom-theme')) {
      return 'custom';
    }
  } catch (e) {
    console.warn('localStorage read failed:', e);
  }
  return null;
}

export const debugThemeOverride = writable<string | null>(getInitialDebugOverride());

// City config for weather. The engine had this API from day one but no UI
// ever called it (2026-07-16 discovery: the storm theme had never once been
// able to fire) — the Sky & Weather section in AlertsSettings is its face now.
const CITY_KEY = 'radial-planner-weather-city';

export interface WeatherCity {
  lat: number;
  lon: number;
  name: string;
}

function readCity(): WeatherCity | null {
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(CITY_KEY);
    return raw ? (JSON.parse(raw) as WeatherCity) : null;
  } catch {
    return null;
  }
}

// UI-facing state: the configured city and a human line about the last check.
export const weatherCity = writable<WeatherCity | null>(readCity());
export const lastWeatherCheck = writable<string>('');

export function setWeatherCity(lat: number, lon: number, name: string) {
  try {
    localStorage.setItem(CITY_KEY, JSON.stringify({ lat, lon, name }));
  } catch (e) {
    console.warn('localStorage write failed:', e);
  }
  weatherCity.set({ lat, lon, name });
  fetchWeather();
}

export function clearWeatherCity() {
  try {
    localStorage.removeItem(CITY_KEY);
  } catch (e) {
    console.warn('localStorage remove failed:', e);
  }
  weatherCity.set(null);
  weatherCache = null;
  lastWeatherCheck.set('');
  updateTheme();
}

// City search via open-meteo's free geocoding (same provider as the weather
// itself, no key needed).
export interface CityResult {
  name: string;
  label: string; // "Brisbane, Queensland, Australia"
  lat: number;
  lon: number;
}
export async function searchCities(query: string): Promise<CityResult[]> {
  const q = query.trim();
  if (!q) return [];
  const res = await fetchWithTimeout(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=en&format=json`,
    4000,
  );
  const data = await res.json();
  return (data.results ?? []).map((r: any) => ({
    name: r.name,
    label: [r.name, r.admin1, r.country].filter(Boolean).join(', '),
    lat: r.latitude,
    lon: r.longitude,
  }));
}

async function fetchWithTimeout(url: string, timeoutMs = 2500): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

let weatherCache: { isStorm: boolean, isHeatwave: boolean, fetchTime: number } | null = null;
async function fetchWeather() {
  try {
    if (typeof localStorage === 'undefined') return;
    const raw = localStorage.getItem(CITY_KEY);
    if (!raw) return;
    const { lat, lon } = JSON.parse(raw);
    
    const res = await fetchWithTimeout(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code`);
    const data = await res.json();
    const temp = data.current.temperature_2m;
    const code = data.current.weather_code;

    // WMO Weather interpretation codes
    // 50-69 rain/drizzle, 80-82 rain showers, 95-99 thunderstorm
    const isStorm = (code >= 50 && code <= 69) || (code >= 80 && code <= 82) || (code >= 95 && code <= 99);
    const isHeatwave = temp >= 35;

    weatherCache = { isStorm, isHeatwave, fetchTime: Date.now() };
    const t = new Date();
    const hhmm = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
    lastWeatherCheck.set(
      `${isStorm ? 'storm ⛈' : isHeatwave ? 'heatwave 🔥' : 'calm'} · ${Math.round(temp)}°C · checked ${hhmm}`,
    );
    updateTheme();
  } catch {
    lastWeatherCheck.set('last check failed — will retry');
    // Ignore weather or localStorage failure
  }
}

let spaceWeatherCache: { isAurora: boolean, fetchTime: number } | null = null;
async function fetchSpaceWeather() {
  try {
    const res = await fetchWithTimeout('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json');
    const data: [string, string][] = await res.json();
    // data[0] is header ["time_tag", "Kp"]
    // The last element is the most recent
    const latest = data[data.length - 1];
    const kp = parseFloat(latest[1]);
    // 4.5, not 5: Ash has seen aurora from her latitude at Kp 4.7 (2026-07) —
    // the theme should fire when the real sky does, not when NOAA rounds up.
    const isAurora = kp >= 4.5;
    
    spaceWeatherCache = { isAurora, fetchTime: Date.now() };
    updateTheme();
  } catch {
    // Ignore space weather failure
  }
}

function getLunarPhase(d: Date) {
  // New Moon Jan 11, 2024 at 11:57 UTC
  const ref = new Date('2024-01-11T11:57:00Z').getTime();
  const cycle = 29.53059 * 24 * 60 * 60 * 1000;
  const diff = d.getTime() - ref;
  let cycles = diff / cycle;
  cycles -= Math.floor(cycles); // 0.0 to 1.0

  if (cycles < 0.03) return { id: 'new', name: 'New Moon', icon: '🌑', cycle: cycles };
  if (cycles < 0.22) return { id: 'waxing_crescent', name: 'Waxing Crescent', icon: '🌒', cycle: cycles };
  if (cycles < 0.28) return { id: 'first_quarter', name: 'First Quarter', icon: '🌓', cycle: cycles };
  if (cycles < 0.47) return { id: 'waxing_gibbous', name: 'Waxing Gibbous', icon: '🌔', cycle: cycles };
  if (cycles < 0.53) return { id: 'full', name: 'Full Moon', icon: '🌕', cycle: cycles };
  if (cycles < 0.72) return { id: 'waning_gibbous', name: 'Waning Gibbous', icon: '🌖', cycle: cycles };
  if (cycles < 0.78) return { id: 'last_quarter', name: 'Last Quarter', icon: '🌗', cycle: cycles };
  return { id: 'waning_crescent', name: 'Waning Crescent', icon: '🌘', cycle: cycles };
}

// Generate CSS Vars mapping
function buildVars(base: string, params: Record<string, string>) {
  return params;
}

export function updateTheme() {
  const d = new Date();
  const h = d.getHours() + d.getMinutes() / 60;
  
  let solarPhase = 'day';
  if (h >= 5 && h < 7) solarPhase = 'pre_dawn';
  else if (h >= 7 && h < 9) solarPhase = 'sunrise';
  else if (h >= 9 && h < 17) solarPhase = 'day';
  else if (h >= 17 && h < 19) solarPhase = 'sunset';
  else if (h >= 19 && h < 20) solarPhase = 'twilight';
  else solarPhase = 'night';
  
  const lunar = getLunarPhase(d);
  
  // Base theme from solar/lunar
  let activePal = solarPhase === 'night' 
    ? (lunar.id === 'full' ? 'night_full' : 'night_new') 
    : solarPhase;
    
  let themeName = solarPhase === 'night' ? lunar.name : solarPhase.replace('_', ' ');
  
  // Overrides
  let celestial = topCelestialEvent(d);
  let wCache = weatherCache;
  let sCache = spaceWeatherCache;
  let isStorm = false;
  let isMeteorShower = false;
  let isAurora = false;
  
  const debugTheme = get(debugThemeOverride);
  if (debugTheme) {
    activePal = debugTheme;
    themeName = debugTheme.replace('_', ' ');
    if (debugTheme === 'storm') isStorm = true;
    if (debugTheme === 'aurora') isAurora = true;
    if (debugTheme === 'meteor_shower') {
      isMeteorShower = true;
      activePal = 'night_new'; // Meteors happen at night
    }
  } else {
    // Normal logic
    if (celestial) {
    if (celestial.type === 'solar-eclipse') {
      activePal = 'solar_eclipse';
      themeName = 'Solar Eclipse';
    } else if (celestial.type === 'lunar-eclipse') {
      activePal = 'lunar_eclipse'; // deeper blood moon
      themeName = 'Lunar Eclipse';
    } else if (celestial.type === 'meteor-shower') {
      isMeteorShower = true;
      themeName = celestial.name;
    }
  } else if (sCache && sCache.fetchTime > Date.now() - 1000 * 60 * 60 && sCache.isAurora) {
    // Space weather overrides regular weather and day/night, but not rare celestial eclipses
    activePal = 'aurora';
    themeName = 'Aurora';
    isAurora = true;
    } else if (wCache && wCache.fetchTime > Date.now() - 1000 * 60 * 30) {
      if (wCache.isStorm) {
        activePal = 'storm';
        themeName = 'Storm';
        isStorm = true;
      } else if (wCache.isHeatwave) {
        activePal = 'heatwave';
        themeName = 'Heatwave';
      }
    }
  }
  
  const vars = { ...PALETTES.common, ...(PALETTES[activePal] || {}) };
  if (vars['--gradient-start'] && vars['--gradient-end']) {
    vars['--ambient-gradient'] = `linear-gradient(135deg, ${vars['--gradient-start']} 0%, ${vars['--gradient-end']} 100%)`;
  }
  
  const isStars = activePal === 'pre_dawn' || 
                  activePal === 'twilight' || 
                  activePal === 'night_new' || 
                  activePal === 'night_full' || 
                  activePal === 'solar_eclipse' || 
                  activePal === 'lunar_eclipse' || 
                  activePal === 'aurora';
  
  envThemeState.set({
    themeName,
    activePal,
    solarPhase,
    lunarPhase: lunar.id,
    lunarPhaseName: lunar.name,
    lunarCycle: lunar.cycle,
    weatherOverride: isStorm ? 'storm' : (wCache?.isHeatwave ? 'heatwave' : null),
    celestialEvent: celestial ? celestial.name : null,
    cssVars: vars,
    isStorm,
    isMeteorShower,
    isAurora,
    isStars,
    isPetals: activePal === 'sweet'
  });
}

// Weather/space-weather were originally fetched ONCE at boot, so a storm
// arriving after launch could never trigger the storm theme (the cache went
// stale after 30 min and the weather branch was skipped forever). Refresh on
// a cadence instead — and again on visibility resume, because iOS suspends
// the PWA's timers: "app wakes after hours asleep" must re-check the sky.
const WEATHER_REFRESH_MS = 15 * 60 * 1000;
const SPACE_REFRESH_MS = 30 * 60 * 1000;
let lastWeatherFetch = 0;
let lastSpaceFetch = 0;

function refreshEnvSources() {
  const now = Date.now();
  if (now - lastWeatherFetch > WEATHER_REFRESH_MS) {
    lastWeatherFetch = now;
    fetchWeather();
  }
  if (now - lastSpaceFetch > SPACE_REFRESH_MS) {
    lastSpaceFetch = now;
    fetchSpaceWeather();
  }
}

function onVisible() {
  if (document.visibilityState === 'visible') {
    updateTheme();
    refreshEnvSources();
  }
}

let timer: ReturnType<typeof setInterval>;
export function startEnvTheme() {
  updateTheme();
  // Update every minute for time changes; re-fetch env sources as they age
  timer = setInterval(() => {
    updateTheme();
    refreshEnvSources();
  }, 60000);
  refreshEnvSources();
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisible);
  }
}

export function stopEnvTheme() {
  clearInterval(timer);
  if (typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', onVisible);
  }
}

debugThemeOverride.subscribe(() => {
  if (typeof window !== 'undefined') updateTheme();
});
