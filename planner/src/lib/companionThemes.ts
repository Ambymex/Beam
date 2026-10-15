import { get } from 'svelte/store';
import { customThemeStore } from './theme';
import { debugThemeOverride, envThemeState, presetHasStars } from './envTheme';
import { savedThemes, saveNamedTheme } from './savedThemes';
import { buildThemeVars, patchThemeSettings, readThemeSettings, THEME_VAR_KEYS, type ThemeSettings } from './themeConfig';
import palettes from './themes.json';

const PRESETS = palettes as Record<string, Record<string, string>>;

export interface CompanionThemeAction {
  type: 'read_themes' | 'save_theme' | 'apply_theme';
  name?: string;
  themeId?: string;
  baseTheme?: string;
  settings?: Partial<ThemeSettings>;
  apply?: boolean;
  preset?: string;
  themeStatus?: 'success' | 'error';
  themeResult?: string;
}

export function isThemeAction(action: { type: string }): action is CompanionThemeAction {
  return action.type === 'read_themes' || action.type === 'save_theme' || action.type === 'apply_theme';
}

function currentSettings(): ThemeSettings {
  const style = getComputedStyle(document.documentElement);
  const vars = Object.fromEntries(THEME_VAR_KEYS.map(key => [key, style.getPropertyValue(key).trim()]));
  return readThemeSettings(vars, get(envThemeState).isStars);
}

function findSaved(idOrName: string) {
  const key = idOrName.trim();
  return get(savedThemes).find(theme => theme.id === key || theme.name.toLowerCase() === key.toLowerCase());
}

function presetVars(name: string): Record<string, string> {
  if (name === 'common' || !Object.hasOwn(PRESETS, name)) throw new Error(`Unknown theme preset: ${name}. Use read_themes for available presets.`);
  return { ...PRESETS.common, ...PRESETS[name] };
}

function baseSettings(base: unknown): ThemeSettings {
  if (base === undefined) return currentSettings();
  if (typeof base !== 'string' || !base.trim()) throw new Error('baseTheme must be a saved theme ID/name or preset key.');
  const saved = findSaved(base);
  return saved ? readThemeSettings(saved.cssVars) : readThemeSettings(presetVars(base), presetHasStars(base));
}

function applyVars(vars: Record<string, string>) {
  try {
    localStorage.setItem('radial-planner-custom-theme', JSON.stringify(vars));
  } catch {
    throw new Error('Could not apply the theme because device storage is full or unavailable.');
  }
  debugThemeOverride.set('custom');
  customThemeStore.set({ ...vars });
}

export function getThemeToolContext() {
  return {
    current: { mode: get(customThemeStore) ? 'custom' : get(debugThemeOverride) ?? 'auto', settings: currentSettings() },
    saved: get(savedThemes).map(theme => ({ id: theme.id, name: theme.name, settings: readThemeSettings(theme.cssVars) })),
    presets: Object.keys(PRESETS).filter(key => key !== 'common'),
  };
}

export function executeThemeAction(action: CompanionThemeAction): string {
  if (action.type === 'save_theme') {
    if (typeof action.name !== 'string') throw new Error('Give the new theme a name.');
    if (action.apply !== undefined && typeof action.apply !== 'boolean') throw new Error('apply must be true or false.');
    const settings = patchThemeSettings(baseSettings(action.baseTheme), action.settings);
    const saved = saveNamedTheme(action.name, buildThemeVars(settings));
    action.themeId = saved.id;
    action.name = saved.name;
    if (action.apply) {
      try { applyVars(saved.cssVars); }
      catch (error) { throw new Error(`Saved “${saved.name}”, but ${error instanceof Error ? error.message : 'could not apply it.'}`); }
    }
    return `Saved ${action.apply ? 'and applied ' : ''}theme “${saved.name}”.`;
  }
  if (action.type === 'apply_theme') {
    if (action.preset !== undefined) {
      if (typeof action.preset !== 'string') throw new Error('preset must be auto or a preset key.');
      if (action.preset !== 'auto') presetVars(action.preset);
      try { localStorage.removeItem('radial-planner-custom-theme'); }
      catch { throw new Error('Could not switch themes because device storage is unavailable.'); }
      customThemeStore.set(null);
      debugThemeOverride.set(action.preset === 'auto' ? null : action.preset);
      return `Applied ${action.preset === 'auto' ? 'the automatic environmental theme' : `theme preset “${action.preset}”`}.`;
    }
    const identifier = action.themeId ?? action.name;
    if (typeof identifier !== 'string' || !identifier.trim()) throw new Error('Choose a saved theme ID or name to apply.');
    const saved = findSaved(identifier);
    if (!saved) throw new Error(`Saved theme not found: ${identifier}. Use read_themes to inspect the library.`);
    applyVars(saved.cssVars);
    action.themeId = saved.id;
    action.name = saved.name;
    return `Applied theme “${saved.name}”.`;
  }
  throw new Error('read_themes requires a companion follow-up turn.');
}

// Keep palettes out of the every-turn prompt; read_themes fetches them only
// when he wants to inspect or design a look. Both chat routes get this schema.
export const THEME_TOOL_PROMPT = `
---
THEME DESIGNER TOOLS: You can invent, name, and save your own custom UI themes, and apply saved themes or environmental presets. You share Ash's Saved themes library. Use the actions below to actually change it; describing colours alone does not save a theme. Theme colours affect the interface, never Ash's emotion/vibe data.
- {"type":"read_themes"}: read the current designer settings, saved themes (IDs, names, settings), and preset keys in a follow-up turn. Use this to inspect a look before modifying it; do not repeatedly request the same read in that follow-up.
- {"type":"save_theme","name":"your unique name","settings":{"gradientStart":"#101525","gradientEnd":"#312340","signalHex":"#d7baff","starsOn":true},"apply":false}: create a NEW named theme. Names are 1–60 characters and must be unique. Omitted settings inherit the current look; optional "baseTheme" chooses a saved theme ID/name or preset key instead. "settings":{} saves that base unchanged. "apply":true saves AND applies; false/omitted saves without changing the current look. To make a variation, give it a new name; existing saved themes are not overwritten.
- {"type":"apply_theme","themeId":"saved-id"} or {"type":"apply_theme","name":"saved name"}: apply a saved theme. {"type":"apply_theme","preset":"auto"} restores the environmental theme; other preset keys choose that preset.
Designer settings: hex colours (#RRGGBB) for gradientStart, gradientEnd, glassHex, surfaceHex, surface2Hex, signalHex, signalContrast, moonHex, starHex, textHex, textDimHex, textFaintHex; numbers 0–1 for glassOpacity, surfaceOpacity, surface2Opacity; glassBlurPx whole pixels 0–40; signalGlowOpacity 0–0.5; borderOpacity 0–0.3; border2Opacity 0–0.2; hairlineOpacity 0–0.1; starsOn boolean. Only these controls are accepted. Keep text readable against the surfaces you choose. Theme actions have no targetDate. Actual tool results appear alongside your message and in later context: an error means the action did not fully complete; do not claim otherwise.
`;
