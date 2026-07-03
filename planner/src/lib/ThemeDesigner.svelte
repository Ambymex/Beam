<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { customThemeStore } from './theme';
  import { envThemeState, debugThemeOverride } from './envTheme';

  const dispatch = createEventDispatcher<{ close: void }>();

  // Track state of customizable parameters
  let gradientStart = '#101525';
  let gradientEnd = '#1a2235';
  let glassHex = '#19191e';
  let glassOpacity = 0.5;
  let glassBlurPx = 18;
  let surfaceHex = '#121829';
  let surfaceOpacity = 1.0;
  let surface2Hex = '#172037';
  let surface2Opacity = 1.0;

  let signalHex = '#a24df0';
  let signalGlowOpacity = 0.2;
  let signalContrast = '#ffffff';

  let moonHex = '#ffffff';

  let borderOpacity = 0.12;
  let border2Opacity = 0.06;
  let hairlineOpacity = 0.03;

  let textHex = '#f8fafc';
  let textDimHex = '#94a3b8';
  let textFaintHex = '#475569';

  let exportText = '';
  let initialized = false;

  let savedSwatches: string[] = ['#101525', '#1a2235', '#a24df0', '#ffffff', '#94a3b8'];
  let selectedSwatch: string | null = null;
  let lastFocusedField: 'gradientStart' | 'gradientEnd' | 'glassHex' | 'surfaceHex' | 'surface2Hex' | 'signalHex' | 'signalContrast' | 'moonHex' | 'textHex' | 'textDimHex' | 'textFaintHex' = 'gradientStart';

  // Custom color picker state
  let showColorPicker = false;
  let activePickerField: 'gradientStart' | 'gradientEnd' | 'glassHex' | 'surfaceHex' | 'surface2Hex' | 'signalHex' | 'signalContrast' | 'moonHex' | 'textHex' | 'textDimHex' | 'textFaintHex' | null = null;
  let pickerH = 0;
  let pickerS = 100;
  let pickerL = 50;
  let pickerHex = '#ff0000';

  // Convert Hex to RGBA utility for glow shadows
  function hexToRgba(hex: string, alpha: number): string {
    const clean = hex.replace('#', '');
    const r = parseInt(clean.substring(0, 2), 16);
    const g = parseInt(clean.substring(2, 4), 16);
    const b = parseInt(clean.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  // Helper to convert rgb/rgba/hex to hex color for HTML input validation
  function colorToHex(color: string): string {
    color = color.trim();
    if (!color) return '#000000';
    if (color.startsWith('#')) {
      if (color.length === 4) {
        return '#' + color[1] + color[1] + color[2] + color[2] + color[3] + color[3];
      }
      return color.substring(0, 7);
    }
    if (color.startsWith('rgb')) {
      const match = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(color);
      if (match) {
        const r = parseInt(match[1]).toString(16).padStart(2, '0');
        const g = parseInt(match[2]).toString(16).padStart(2, '0');
        const b = parseInt(match[3]).toString(16).padStart(2, '0');
        return `#${r}${g}${b}`;
      }
    }
    const map: Record<string, string> = {
      'black': '#000000',
      'white': '#ffffff',
      'red': '#ff0000',
      'green': '#00ff00',
      'blue': '#0000ff'
    };
    return map[color.toLowerCase()] || '#000000';
  }

  // Helper to interpolate between two hex colors
  function interpolateHex(color1: string, color2: string, ratio = 0.5): string {
    const hex1 = colorToHex(color1).replace('#', '');
    const hex2 = colorToHex(color2).replace('#', '');
    
    const r1 = parseInt(hex1.substring(0, 2), 16);
    const g1 = parseInt(hex1.substring(2, 4), 16);
    const b1 = parseInt(hex1.substring(4, 6), 16);
    
    const r2 = parseInt(hex2.substring(0, 2), 16);
    const g2 = parseInt(hex2.substring(2, 4), 16);
    const b2 = parseInt(hex2.substring(4, 6), 16);
    
    const r = Math.round(r1 + (r2 - r1) * ratio).toString(16).padStart(2, '0');
    const g = Math.round(g1 + (g2 - g1) * ratio).toString(16).padStart(2, '0');
    const b = Math.round(b1 + (b2 - b1) * ratio).toString(16).padStart(2, '0');
    
    return `#${r}${g}${b}`;
  }

  onMount(() => {
    // If a custom theme is already saved in localStorage/store, load it first
    let currentCustom: Record<string, string> | null = null;
    const unsub = customThemeStore.subscribe(val => currentCustom = val);
    unsub();

    if (currentCustom) {
      applyConfig(currentCustom);
    } else {
      loadFromComputedStyle();
    }

    try {
      const saved = localStorage.getItem('radial-planner-theme-swatches');
      if (saved) {
        savedSwatches = JSON.parse(saved);
      }
    } catch (e) {
      console.error('Error parsing theme swatches', e);
    }
    
    initialized = true;

    // Subscribe to env theme updates to keep pickers in sync when custom theme is NOT active
    const unsubEnv = envThemeState.subscribe(() => {
      if (initialized && !$customThemeStore) {
        // Wait a tick for DOM update to propagate
        setTimeout(loadFromComputedStyle, 50);
      }
    });

    return () => {
      unsubEnv();
    };
  });

  function loadFromComputedStyle() {
    const style = getComputedStyle(document.documentElement);
    
    gradientStart = colorToHex(style.getPropertyValue('--gradient-start').trim() || style.getPropertyValue('--app-bg').trim() || gradientStart);
    gradientEnd = colorToHex(style.getPropertyValue('--gradient-end').trim() || style.getPropertyValue('--app-bg').trim() || gradientEnd);
    const glassBgVal = style.getPropertyValue('--glass-bg').trim();
    if (glassBgVal) {
      glassHex = colorToHex(glassBgVal);
      const match = /rgba?\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)/.exec(glassBgVal);
      glassOpacity = match ? parseFloat(match[1]) : 1.0;
    }
    
    const blurVal = style.getPropertyValue('--glass-blur').trim();
    if (blurVal) {
      glassBlurPx = parseInt(blurVal) || glassBlurPx;
    }
    
    const parseOpacity = (property: string, fallback: number, hexMeansOpaque = false) => {
      const val = style.getPropertyValue(property).trim();
      const match = /rgba?\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)/.exec(val);
      if (match) return parseFloat(match[1]);
      // a solid hex/rgb() surface is fully opaque; borders keep their fallback
      return hexMeansOpaque && val ? 1.0 : fallback;
    };

    surfaceHex = colorToHex(style.getPropertyValue('--surface').trim() || surfaceHex);
    surfaceOpacity = parseOpacity('--surface', surfaceOpacity, true);
    surface2Hex = colorToHex(style.getPropertyValue('--surface-2').trim() || surface2Hex);
    surface2Opacity = parseOpacity('--surface-2', surface2Opacity, true);

    signalHex = colorToHex(style.getPropertyValue('--signal').trim() || signalHex);
    signalContrast = colorToHex(style.getPropertyValue('--signal-contrast').trim() || signalContrast);
    signalGlowOpacity = parseOpacity('--signal-glow', signalGlowOpacity, true);

    borderOpacity = parseOpacity('--border', borderOpacity);
    border2Opacity = parseOpacity('--border-2', border2Opacity);
    hairlineOpacity = parseOpacity('--hairline', hairlineOpacity);
    
    textHex = colorToHex(style.getPropertyValue('--text').trim() || textHex);
    textDimHex = colorToHex(style.getPropertyValue('--text-dim').trim() || textDimHex);
    textFaintHex = colorToHex(style.getPropertyValue('--text-faint').trim() || textFaintHex);

    moonHex = colorToHex(style.getPropertyValue('--moon-color').trim() || '#ffffff');
  }

  function applyConfig(vars: Record<string, string>) {
    if (vars['--gradient-start']) gradientStart = colorToHex(vars['--gradient-start']);
    if (vars['--gradient-end']) gradientEnd = colorToHex(vars['--gradient-end']);
    if (vars['--app-bg'] && !vars['--gradient-start']) {
      gradientStart = colorToHex(vars['--app-bg']);
      gradientEnd = colorToHex(vars['--app-bg']);
    }
    if (vars['--glass-bg']) {
      glassHex = colorToHex(vars['--glass-bg']);
      const match = /rgba?\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)/.exec(vars['--glass-bg']);
      glassOpacity = match ? parseFloat(match[1]) : 1.0;
    }
    if (vars['--glass-blur']) glassBlurPx = parseInt(vars['--glass-blur']) || glassBlurPx;
    const alphaOf = (val: string | undefined, fallback: number) => {
      if (!val) return fallback;
      const match = /rgba?\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)/.exec(val);
      return match ? parseFloat(match[1]) : 1.0;
    };
    if (vars['--surface']) {
      surfaceHex = colorToHex(vars['--surface']);
      surfaceOpacity = alphaOf(vars['--surface'], surfaceOpacity);
    }
    if (vars['--surface-2']) {
      surface2Hex = colorToHex(vars['--surface-2']);
      surface2Opacity = alphaOf(vars['--surface-2'], surface2Opacity);
    }
    if (vars['--signal']) signalHex = colorToHex(vars['--signal']);
    if (vars['--signal-contrast']) signalContrast = colorToHex(vars['--signal-contrast']);
    if (vars['--signal-glow']) signalGlowOpacity = alphaOf(vars['--signal-glow'], signalGlowOpacity);
    
    // Extract opacities for white borders
    const borderMatch = /rgba\(255, 255, 255, ([\d.]+)\)/.exec(vars['--border'] || '');
    if (borderMatch) borderOpacity = parseFloat(borderMatch[1]);
    const border2Match = /rgba\(255, 255, 255, ([\d.]+)\)/.exec(vars['--border-2'] || '');
    if (border2Match) border2Opacity = parseFloat(border2Match[1]);
    const hairlineMatch = /rgba\(255, 255, 255, ([\d.]+)\)/.exec(vars['--hairline'] || '');
    if (hairlineMatch) hairlineOpacity = parseFloat(hairlineMatch[1]);
    
    if (vars['--text']) textHex = colorToHex(vars['--text']);
    if (vars['--text-dim']) textDimHex = colorToHex(vars['--text-dim']);
    if (vars['--text-faint']) textFaintHex = colorToHex(vars['--text-faint']);
    if (vars['--moon-color']) moonHex = colorToHex(vars['--moon-color']);
  }

  function saveCustomTheme() {
    if (!initialized) return;
    debugThemeOverride.set('custom');
    customThemeStore.set({
      '--gradient-start': gradientStart,
      '--gradient-end': gradientEnd,
      '--ambient-gradient': `linear-gradient(135deg, ${gradientStart} 0%, ${gradientEnd} 100%)`,
      '--app-bg': gradientStart,
      '--glass-bg': hexToRgba(glassHex, glassOpacity),
      '--glass-border': hexToRgba(glassHex, Math.min(1, glassOpacity + 0.25)),
      '--glass-blur': `${glassBlurPx}px`,
      '--surface': hexToRgba(surfaceHex, surfaceOpacity),
      '--surface-2': hexToRgba(surface2Hex, surface2Opacity),
      '--surface-3': hexToRgba(interpolateHex(surface2Hex, '#ffffff', 0.2), Math.min(1, surface2Opacity * 1.3)),
      '--signal': signalHex,
      '--signal-glow': hexToRgba(signalHex, signalGlowOpacity),
      '--signal-contrast': signalContrast,
      '--border': `rgba(255, 255, 255, ${borderOpacity})`,
      '--border-2': `rgba(255, 255, 255, ${border2Opacity})`,
      '--hairline': `rgba(255, 255, 255, ${hairlineOpacity})`,
      '--text': textHex,
      '--text-2': interpolateHex(textHex, textDimHex, 0.4),
      '--text-dim': textDimHex,
      '--text-faint': textFaintHex,
      '--moon-color': moonHex,
    });
  }

  function exportConfig() {
    const config = {
      name: 'Custom Glassmorphism Theme',
      cssVars: {
        '--gradient-start': gradientStart,
        '--gradient-end': gradientEnd,
        '--ambient-gradient': `linear-gradient(135deg, ${gradientStart} 0%, ${gradientEnd} 100%)`,
        '--app-bg': gradientStart,
        '--glass-bg': hexToRgba(glassHex, glassOpacity),
        '--glass-border': hexToRgba(glassHex, Math.min(1, glassOpacity + 0.25)),
        '--glass-blur': `${glassBlurPx}px`,
        '--surface': hexToRgba(surfaceHex, surfaceOpacity),
        '--surface-2': hexToRgba(surface2Hex, surface2Opacity),
        '--surface-3': hexToRgba(interpolateHex(surface2Hex, '#ffffff', 0.2), Math.min(1, surface2Opacity * 1.3)),
        '--signal': signalHex,
        '--signal-glow': hexToRgba(signalHex, signalGlowOpacity),
        '--signal-contrast': signalContrast,
        '--border': `rgba(255, 255, 255, ${borderOpacity})`,
        '--border-2': `rgba(255, 255, 255, ${border2Opacity})`,
        '--hairline': `rgba(255, 255, 255, ${hairlineOpacity})`,
        '--text': textHex,
        '--text-2': interpolateHex(textHex, textDimHex, 0.4),
        '--text-dim': textDimHex,
        '--text-faint': textFaintHex,
        '--moon-color': moonHex,
      }
    };
    exportText = JSON.stringify(config, null, 2);
    navigator.clipboard.writeText(exportText).then(() => {
      alert('Config copied to clipboard!');
    }).catch(() => {
      alert('Could not copy automatically. You can copy the text from the box below.');
    });
  }

  function importConfig(jsonStr: string) {
    if (!jsonStr.trim()) return;
    try {
      const config = JSON.parse(jsonStr);
      if (!config.cssVars) {
        alert('Invalid format: Missing cssVars key.');
        return;
      }
      applyConfig(config.cssVars);
      saveCustomTheme();
    } catch (err) {
      // Keep silent while typing, only alert if they pasted a large invalid chunk
      if (jsonStr.length > 20) {
        console.warn('Invalid JSON format on theme import');
      }
    }
  }

  function resetToEnvTheme() {
    customThemeStore.set(null);
    debugThemeOverride.set(null);
    initialized = false;
    // Wait for DOM styles to update from default theme, then reload from styles
    setTimeout(() => {
      loadFromComputedStyle();
      initialized = true;
    }, 50);
  }

  function saveSwatch(color: string) {
    const hex = colorToHex(color);
    if (!savedSwatches.includes(hex)) {
      savedSwatches = [...savedSwatches, hex];
      try {
        localStorage.setItem('radial-planner-theme-swatches', JSON.stringify(savedSwatches));
      } catch (e) {
        console.warn('localStorage write failed:', e);
      }
    }
  }

  function deleteSwatch(color: string) {
    savedSwatches = savedSwatches.filter(c => c !== color);
    try {
      localStorage.setItem('radial-planner-theme-swatches', JSON.stringify(savedSwatches));
    } catch (e) {
      console.warn('localStorage write failed:', e);
    }
  }

  function hexToHSL(hex: string) {
    const h = hex.replace('#', '');
    const r = parseInt(h.substring(0, 2), 16) / 255;
    const g = parseInt(h.substring(2, 4), 16) / 255;
    const b = parseInt(h.substring(4, 6), 16) / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let hVal = 0;
    let sVal = 0;
    const lVal = (max + min) / 2;

    if (max !== min) {
      const d = max - min;
      sVal = lVal > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: hVal = (g - b) / d + (g < b ? 6 : 0); break;
        case g: hVal = (b - r) / d + 2; break;
        case b: hVal = (r - g) / d + 4; break;
      }
      hVal /= 6;
    }
    return { h: Math.round(hVal * 360), s: Math.round(sVal * 100), l: Math.round(lVal * 100) };
  }

  function hslToHex(h: number, s: number, l: number): string {
    s /= 100;
    l /= 100;
    const k = (n: number) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) =>
      l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
    
    const r = Math.round(255 * f(0)).toString(16).padStart(2, '0');
    const g = Math.round(255 * f(8)).toString(16).padStart(2, '0');
    const b = Math.round(255 * f(4)).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`;
  }

  function openColorPicker(field: 'gradientStart' | 'gradientEnd' | 'glassHex' | 'surfaceHex' | 'surface2Hex' | 'signalHex' | 'signalContrast' | 'moonHex' | 'textHex' | 'textDimHex' | 'textFaintHex') {
    activePickerField = field;
    
    let color = '#ffffff';
    if (field === 'gradientStart') color = gradientStart;
    else if (field === 'gradientEnd') color = gradientEnd;
    else if (field === 'glassHex') color = glassHex;
    else if (field === 'surfaceHex') color = surfaceHex;
    else if (field === 'surface2Hex') color = surface2Hex;
    else if (field === 'signalHex') color = signalHex;
    else if (field === 'signalContrast') color = signalContrast;
    else if (field === 'moonHex') color = moonHex;
    else if (field === 'textHex') color = textHex;
    else if (field === 'textDimHex') color = textDimHex;
    else if (field === 'textFaintHex') color = textFaintHex;
    
    pickerHex = colorToHex(color);
    const hsl = hexToHSL(pickerHex);
    pickerH = hsl.h;
    pickerS = hsl.s;
    pickerL = hsl.l;
    
    if (savedSwatches.includes(pickerHex)) {
      selectedSwatch = pickerHex;
    } else {
      selectedSwatch = null;
    }
    
    showColorPicker = true;
  }

  function updateActiveColorFromHSL() {
    pickerHex = hslToHex(pickerH, pickerS, pickerL);
    
    if (activePickerField === 'gradientStart') gradientStart = pickerHex;
    else if (activePickerField === 'gradientEnd') gradientEnd = pickerHex;
    else if (activePickerField === 'glassHex') glassHex = pickerHex;
    else if (activePickerField === 'surfaceHex') surfaceHex = pickerHex;
    else if (activePickerField === 'surface2Hex') surface2Hex = pickerHex;
    else if (activePickerField === 'signalHex') signalHex = pickerHex;
    else if (activePickerField === 'signalContrast') signalContrast = pickerHex;
    else if (activePickerField === 'moonHex') moonHex = pickerHex;
    else if (activePickerField === 'textHex') textHex = pickerHex;
    else if (activePickerField === 'textDimHex') textDimHex = pickerHex;
    else if (activePickerField === 'textFaintHex') textFaintHex = pickerHex;

    if (savedSwatches.includes(pickerHex)) {
      selectedSwatch = pickerHex;
    } else {
      selectedSwatch = null;
    }

    saveCustomTheme();
  }

  function updateActiveColorFromHex(e: Event) {
    const inputHex = colorToHex((e.target as HTMLInputElement).value);
    pickerHex = inputHex;
    
    const hsl = hexToHSL(pickerHex);
    pickerH = hsl.h;
    pickerS = hsl.s;
    pickerL = hsl.l;
    
    if (activePickerField === 'gradientStart') gradientStart = pickerHex;
    else if (activePickerField === 'gradientEnd') gradientEnd = pickerHex;
    else if (activePickerField === 'glassHex') glassHex = pickerHex;
    else if (activePickerField === 'surfaceHex') surfaceHex = pickerHex;
    else if (activePickerField === 'surface2Hex') surface2Hex = pickerHex;
    else if (activePickerField === 'signalHex') signalHex = pickerHex;
    else if (activePickerField === 'signalContrast') signalContrast = pickerHex;
    else if (activePickerField === 'moonHex') moonHex = pickerHex;
    else if (activePickerField === 'textHex') textHex = pickerHex;
    else if (activePickerField === 'textDimHex') textDimHex = pickerHex;
    else if (activePickerField === 'textFaintHex') textFaintHex = pickerHex;

    if (savedSwatches.includes(pickerHex)) {
      selectedSwatch = pickerHex;
    } else {
      selectedSwatch = null;
    }

    saveCustomTheme();
  }

  function selectSwatchInPicker(color: string) {
    selectedSwatch = color;
    pickerHex = color;
    const hsl = hexToHSL(color);
    pickerH = hsl.h;
    pickerS = hsl.s;
    pickerL = hsl.l;
    
    if (activePickerField === 'gradientStart') gradientStart = color;
    else if (activePickerField === 'gradientEnd') gradientEnd = color;
    else if (activePickerField === 'glassHex') glassHex = color;
    else if (activePickerField === 'surfaceHex') surfaceHex = color;
    else if (activePickerField === 'surface2Hex') surface2Hex = color;
    else if (activePickerField === 'signalHex') signalHex = color;
    else if (activePickerField === 'signalContrast') signalContrast = color;
    else if (activePickerField === 'moonHex') moonHex = color;
    else if (activePickerField === 'textHex') textHex = color;
    else if (activePickerField === 'textDimHex') textDimHex = color;
    else if (activePickerField === 'textFaintHex') textFaintHex = color;
    
    saveCustomTheme();
  }

  function addCurrentToSwatches() {
    const hex = colorToHex(pickerHex);
    if (!savedSwatches.includes(hex)) {
      savedSwatches = [...savedSwatches, hex];
      try {
        localStorage.setItem('radial-planner-theme-swatches', JSON.stringify(savedSwatches));
      } catch (e) {
        console.warn('localStorage write failed:', e);
      }
    }
    selectedSwatch = hex;
  }

  function removeSelectedSwatch() {
    if (selectedSwatch) {
      deleteSwatch(selectedSwatch);
      selectedSwatch = null;
    }
  }
</script>

<div class="designer glass-card">
  <header>
    <h4>UI Palette Designer</h4>
    <button on:click={() => dispatch('close')} aria-label="Close theme designer">✕</button>
  </header>
  
  <div class="content">
    <div class="field">
      <span>Gradient Start</span>
      <button class="color-indicator-btn" style="background: {gradientStart};" on:click={() => openColorPicker('gradientStart')} aria-label="Gradient Start color"></button>
    </div>

    <div class="field">
      <span>Gradient End</span>
      <button class="color-indicator-btn" style="background: {gradientEnd};" on:click={() => openColorPicker('gradientEnd')} aria-label="Gradient End color"></button>
    </div>

    <div class="field">
      <span>Glass Color</span>
      <button class="color-indicator-btn" style="background: {glassHex};" on:click={() => openColorPicker('glassHex')} aria-label="Glass color"></button>
    </div>

    <div class="field">
      <label for="glassOpacity">Glass Opacity ({Math.round(glassOpacity * 100)}%):</label>
      <input id="glassOpacity" type="range" min="0" max="1" step="0.05" bind:value={glassOpacity} on:input={saveCustomTheme} />
    </div>

    <div class="field">
      <label for="glassBlur">Glass Blur ({glassBlurPx}px):</label>
      <input id="glassBlur" type="range" min="0" max="40" bind:value={glassBlurPx} on:input={saveCustomTheme} />
    </div>

    <div class="field">
      <span>Surface Background</span>
      <button class="color-indicator-btn" style="background: {surfaceHex};" on:click={() => openColorPicker('surfaceHex')} aria-label="Surface Background color"></button>
    </div>

    <div class="field">
      <label for="surfaceOpacity">Surface Opacity ({Math.round(surfaceOpacity * 100)}%):</label>
      <input id="surfaceOpacity" type="range" min="0" max="1" step="0.02" bind:value={surfaceOpacity} on:input={saveCustomTheme} />
    </div>

    <div class="field">
      <span>Card / Chip Background</span>
      <button class="color-indicator-btn" style="background: {surface2Hex};" on:click={() => openColorPicker('surface2Hex')} aria-label="Card and chip background color"></button>
    </div>

    <div class="field">
      <label for="surface2Opacity">Card / Chip Opacity ({Math.round(surface2Opacity * 100)}%):</label>
      <input id="surface2Opacity" type="range" min="0" max="1" step="0.02" bind:value={surface2Opacity} on:input={saveCustomTheme} />
    </div>

    <div class="field">
      <span>Signal Color</span>
      <button class="color-indicator-btn" style="background: {signalHex};" on:click={() => openColorPicker('signalHex')} aria-label="Signal color"></button>
    </div>

    <div class="field">
      <span>Signal Contrast Text</span>
      <button class="color-indicator-btn" style="background: {signalContrast};" on:click={() => openColorPicker('signalContrast')} aria-label="Signal Contrast Text color"></button>
    </div>

    <div class="field">
      <label for="signalGlow">Signal Glow ({Math.round(signalGlowOpacity * 100)}%):</label>
      <input id="signalGlow" type="range" min="0" max="0.5" step="0.05" bind:value={signalGlowOpacity} on:input={saveCustomTheme} />
    </div>

    <div class="field">
      <span>Moon Color</span>
      <button class="color-indicator-btn" style="background: {moonHex};" on:click={() => openColorPicker('moonHex')} aria-label="Moon color"></button>
    </div>

    <div class="field">
      <label for="borderOpacity">Primary Border ({Math.round(borderOpacity * 100)}%):</label>
      <input id="borderOpacity" type="range" min="0" max="0.3" step="0.01" bind:value={borderOpacity} on:input={saveCustomTheme} />
    </div>

    <div class="field">
      <label for="border2Opacity">Secondary Border ({Math.round(border2Opacity * 100)}%):</label>
      <input id="border2Opacity" type="range" min="0" max="0.2" step="0.01" bind:value={border2Opacity} on:input={saveCustomTheme} />
    </div>

    <div class="field">
      <label for="hairlineOpacity">Hairline Separation ({Math.round(hairlineOpacity * 100)}%):</label>
      <input id="hairlineOpacity" type="range" min="0" max="0.1" step="0.005" bind:value={hairlineOpacity} on:input={saveCustomTheme} />
    </div>

    <div class="field">
      <span>Primary Text</span>
      <button class="color-indicator-btn" style="background: {textHex};" on:click={() => openColorPicker('textHex')} aria-label="Primary Text color"></button>
    </div>

    <div class="field">
      <span>Dim Text</span>
      <button class="color-indicator-btn" style="background: {textDimHex};" on:click={() => openColorPicker('textDimHex')} aria-label="Dim Text color"></button>
    </div>

    <div class="field">
      <span>Faint Text</span>
      <button class="color-indicator-btn" style="background: {textFaintHex};" on:click={() => openColorPicker('textFaintHex')} aria-label="Faint Text color"></button>
    </div>

    <div class="actions">
      <button class="action-btn" on:click={exportConfig}>Copy Config JSON</button>
      <button class="action-btn reset" on:click={resetToEnvTheme}>Reset to Env Theme</button>
      <textarea 
        placeholder="Paste config JSON here to import..." 
        on:input={(e) => importConfig(e.currentTarget.value)}
        bind:value={exportText}
      ></textarea>
    </div>
  </div>
</div>

{#if showColorPicker && activePickerField}
  <button class="picker-overlay" on:click={() => showColorPicker = false} on:keydown|stopPropagation aria-label="Close color picker modal" style="border:none; outline:none; padding:0; margin:0; text-align:inherit; display:flex;">
    <div class="picker-popover glass-card" on:click|stopPropagation on:keydown|stopPropagation tabindex="-1" role="dialog" aria-modal="true" aria-label="Color Picker">
      <header class="picker-header">
        <h5>Select Color</h5>
        <button class="close-picker-btn" on:click={() => showColorPicker = false} aria-label="Close picker">✕</button>
      </header>
      
      <div class="picker-body">
        <div class="picker-preview" style="background: {pickerHex};">
          <span class="picker-hex-label">{pickerHex}</span>
        </div>
        
        <div class="slider-field">
          <label for="hue-range">Hue ({pickerH}°)</label>
          <input id="hue-range" type="range" class="hue-slider" min="0" max="360" bind:value={pickerH} on:input={updateActiveColorFromHSL} />
        </div>
        
        <div class="slider-field">
          <label for="sat-range">Saturation ({pickerS}%)</label>
          <input id="sat-range" type="range" class="sat-slider" style="background: linear-gradient(to right, {hslToHex(pickerH, 0, 50)}, {hslToHex(pickerH, 100, 50)});" min="0" max="100" bind:value={pickerS} on:input={updateActiveColorFromHSL} />
        </div>
        
        <div class="slider-field">
          <label for="light-range">Lightness ({pickerL}%)</label>
          <input id="light-range" type="range" class="light-slider" min="0" max="100" bind:value={pickerL} on:input={updateActiveColorFromHSL} />
        </div>
        
        <div class="hex-input-row">
          <label for="picker-hex">Hex Code:</label>
          <input id="picker-hex" type="text" class="hex-input" value={pickerHex} on:change={updateActiveColorFromHex} />
        </div>

        <div class="picker-swatches">
          <span class="swatches-title">Swatches:</span>
          <div class="swatches-row">
            <div class="swatches-grid">
              {#each savedSwatches as color}
                <button 
                  class="picker-swatch-btn" 
                  class:selected={selectedSwatch === color}
                  style="background: {color};" 
                  on:click={() => selectSwatchInPicker(color)}
                  aria-label="Select swatch {color}"
                ></button>
              {/each}
            </div>
            <div class="swatch-controls">
              <button class="swatch-ctrl-btn add" title="Save color" on:click={addCurrentToSwatches}>＋</button>
              <button class="swatch-ctrl-btn remove" title="Remove swatch" on:click={removeSelectedSwatch} disabled={!selectedSwatch}>－</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </button>
{/if}

<style>
  .designer {
    position: fixed;
    top: 75px;
    right: 16px;
    width: 320px;
    max-height: calc(100vh - 120px);
    display: flex;
    flex-direction: column;
    z-index: 100;
    border-radius: 12px;
    overflow: hidden;
    background: var(--glass-bg);
    backdrop-filter: blur(var(--glass-blur));
    -webkit-backdrop-filter: blur(var(--glass-blur));
    border: 1px solid var(--glass-border);
    box-shadow: var(--glass-shadow);
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 14px;
    border-bottom: 1px solid var(--hairline);
    background: var(--glass-bg);
  }
  header h4 {
    margin: 0;
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text);
  }
  header button {
    background: none;
    border: none;
    color: var(--text-dim);
    font-size: 16px;
    cursor: pointer;
  }
  .content {
    flex: 1;
    overflow-y: auto;
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .field {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 12px;
    color: var(--text);
  }
  .field input[type="range"] {
    width: 120px;
  }

  .actions {
    margin-top: 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .action-btn {
    width: 100%;
    padding: 8px;
    background: var(--surface-3);
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--text);
    font-weight: 600;
    font-size: 12px;
    cursor: pointer;
    transition: background-color 0.2s;
  }
  .action-btn:hover {
    background: var(--surface-2);
  }
  .action-btn.reset {
    border-color: var(--signal);
    color: var(--signal);
  }
  textarea {
    width: 100%;
    height: 65px;
    background: var(--surface);
    border: 1px solid var(--border-2);
    border-radius: 6px;
    padding: 6px;
    color: var(--text-dim);
    font-size: 10px;
    font-family: monospace;
    resize: none;
    box-sizing: border-box;
  }
  .color-indicator-btn {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: 1.5px solid var(--border);
    cursor: pointer;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    transition: transform 0.12s, border-color 0.12s;
  }
  .color-indicator-btn:hover {
    transform: scale(1.1);
    border-color: var(--text);
  }
  
  .picker-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0, 0, 0, 0.4);
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .picker-popover {
    width: 320px;
    background: var(--glass-bg);
    backdrop-filter: blur(var(--glass-blur));
    -webkit-backdrop-filter: blur(var(--glass-blur));
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 18px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .picker-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid var(--border-2);
    padding-bottom: 6px;
  }
  .picker-header h5 {
    margin: 0;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text);
  }
  .close-picker-btn {
    background: none;
    border: none;
    color: var(--text-dim);
    font-size: 14px;
    cursor: pointer;
  }
  .picker-body {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .picker-preview {
    height: 44px;
    border-radius: 6px;
    border: 1px solid var(--border-2);
    display: flex;
    align-items: center;
    justify-content: center;
    color: #ffffff;
    font-weight: bold;
    font-size: 12px;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
  }
  .slider-field {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .slider-field label {
    font-size: 11px;
    color: var(--text-dim);
  }
  .hue-slider {
    background: linear-gradient(to right, red, yellow, lime, cyan, blue, magenta, red) !important;
    height: 10px;
    border-radius: 5px;
    outline: none;
    -webkit-appearance: none;
  }
  .hue-slider::-webkit-slider-runnable-track {
    background: none;
  }
  .hue-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #ffffff;
    border: 1px solid #000000;
    cursor: pointer;
    margin-top: -4px;
  }
  
  .sat-slider, .light-slider {
    height: 10px;
    border-radius: 5px;
    outline: none;
    -webkit-appearance: none;
  }
  .light-slider {
    background: linear-gradient(to right, #000000, #808080, #ffffff) !important;
  }
  .sat-slider::-webkit-slider-thumb, .light-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #ffffff;
    border: 1px solid #000000;
    cursor: pointer;
    margin-top: -4px;
  }

  .hex-input-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 12px;
    color: var(--text-dim);
  }
  .hex-input {
    width: 90px;
    background: var(--surface);
    border: 1px solid var(--border-2);
    border-radius: 4px;
    color: var(--text);
    padding: 4px 8px;
    font-size: 12px;
    text-align: center;
  }
  
  .picker-swatches {
    border-top: 1px solid var(--border-2);
    padding-top: 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .swatches-title {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-dim);
  }
  .swatches-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    gap: 12px;
    box-sizing: border-box;
  }
  .swatches-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    flex: 1;
  }
  .picker-swatch-btn {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: 1.5px solid var(--border-2);
    cursor: pointer;
    padding: 0;
    transition: transform 0.08s;
  }
  .picker-swatch-btn:hover {
    transform: scale(1.1);
  }
  .picker-swatch-btn.selected {
    border-color: var(--signal);
    box-shadow: 0 0 0 1.5px var(--surface-3), 0 0 0 2.5px var(--signal);
  }
  .swatch-controls {
    display: flex;
    gap: 6px;
    flex-shrink: 0;
  }
  .swatch-ctrl-btn {
    width: 26px;
    height: 26px;
    border-radius: 6px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    color: var(--text);
    font-size: 14px;
    font-weight: bold;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    padding: 0;
    transition: background-color 0.12s;
  }
  .swatch-ctrl-btn:hover:not(:disabled) {
    background: var(--surface-3);
  }
  .swatch-ctrl-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
</style>
