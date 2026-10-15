import { get, writable } from 'svelte/store';

export const SAVED_THEMES_KEY = 'radial-planner-saved-themes-v1';

export interface SavedTheme {
  id: string;
  name: string;
  cssVars: Record<string, string>;
}

function isSavedTheme(value: unknown): value is SavedTheme {
  if (!value || typeof value !== 'object') return false;
  const theme = value as SavedTheme;
  return typeof theme.id === 'string' && theme.id.length > 0
    && typeof theme.name === 'string' && theme.name.trim().length > 0
    && !!theme.cssVars && typeof theme.cssVars === 'object' && !Array.isArray(theme.cssVars)
    && Object.keys(theme.cssVars).length > 0
    && Object.entries(theme.cssVars).every(([key, val]) => key.startsWith('--') && typeof val === 'string');
}

function loadSavedThemes(): SavedTheme[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const stored = JSON.parse(localStorage.getItem(SAVED_THEMES_KEY) ?? '[]');
    return Array.isArray(stored) ? stored.filter(isSavedTheme) : [];
  } catch {
    return [];
  }
}

export const savedThemes = writable<SavedTheme[]>(loadSavedThemes());

// Persist before publishing so a full or unavailable store never reports a save
// that will disappear on the next launch. Live edits use a separate theme store.
function persist(themes: SavedTheme[]) {
  try {
    localStorage.setItem(SAVED_THEMES_KEY, JSON.stringify(themes));
  } catch {
    throw new Error('Could not save themes. Your device storage may be full or unavailable.');
  }
  savedThemes.set(themes);
}

export function saveNamedTheme(name: string, cssVars: Record<string, string>, id?: string): SavedTheme {
  const trimmedName = name.trim();
  if (!trimmedName) throw new Error('Give your theme a name first.');
  if (trimmedName.length > 60) throw new Error('Use a theme name of 60 characters or fewer.');

  const themes = get(savedThemes);
  if (id && !themes.some(theme => theme.id === id)) {
    throw new Error('That saved theme no longer exists. Save a new theme instead.');
  }
  if (themes.some(theme => theme.id !== id && theme.name.toLowerCase() === trimmedName.toLowerCase())) {
    throw new Error('A theme with that name already exists. Choose another name or use Update.');
  }

  const saved = { id: id ?? crypto.randomUUID(), name: trimmedName, cssVars: { ...cssVars } };
  persist(id ? themes.map(theme => theme.id === id ? saved : theme) : [...themes, saved]);
  return saved;
}

export function deleteNamedTheme(id: string) {
  persist(get(savedThemes).filter(theme => theme.id !== id));
}
