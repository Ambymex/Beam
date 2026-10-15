// 🎨 2D Fish Studio — Color Wheel & Harmony Generator Utilities

export interface ColorHarmony {
  name: string;
  role: string;
  hex: string;
  hueOffset: number;
}

export function hexToHsl(hex: string): { h: number; s: number; l: number } {
  let c = (hex || '#70d6ff').trim().replace('#', '');
  if (c.length === 3) c = c.split('').map((x) => x + x).join('');
  if (c.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(c)) c = '70d6ff';
  
  const num = parseInt(c, 16);
  const r = ((num >> 16) & 255) / 255;
  const g = ((num >> 8) & 255) / 255;
  const b = (num & 255) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

export function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360;
  const sFrac = Math.max(0, Math.min(100, s)) / 100;
  const lFrac = Math.max(0, Math.min(100, l)) / 100;

  const c = (1 - Math.abs(2 * lFrac - 1)) * sFrac;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lFrac - c / 2;
  let r = 0,
    g = 0,
    b = 0;

  if (0 <= h && h < 60) {
    r = c;
    g = x;
    b = 0;
  } else if (60 <= h && h < 120) {
    r = x;
    g = c;
    b = 0;
  } else if (120 <= h && h < 180) {
    r = 0;
    g = c;
    b = x;
  } else if (180 <= h && h < 240) {
    r = 0;
    g = x;
    b = c;
  } else if (240 <= h && h < 300) {
    r = x;
    g = 0;
    b = c;
  } else if (300 <= h && h < 360) {
    r = c;
    g = 0;
    b = x;
  }

  const toHex = (val: number) => {
    const clamped = Math.max(0, Math.min(255, Math.round((val + m) * 255)));
    const hex = clamped.toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function getHarmonies(baseHex: string): ColorHarmony[] {
  const { h, s, l } = hexToHsl(baseHex);
  const sat = Math.max(35, s);
  const lum = Math.max(30, Math.min(70, l));

  return [
    {
      name: 'Complementary',
      role: '180° Exact Opposite — high vibrant pop',
      hex: hslToHex((h + 180) % 360, sat, lum),
      hueOffset: 180,
    },
    {
      name: 'Split Comp (Warm)',
      role: '150° Warm harmony',
      hex: hslToHex((h + 150) % 360, sat, lum),
      hueOffset: 150,
    },
    {
      name: 'Split Comp (Cool)',
      role: '210° Cool harmony',
      hex: hslToHex((h + 210) % 360, sat, lum),
      hueOffset: 210,
    },
    {
      name: 'Analogous (Warm)',
      role: '+35° Flow gradient',
      hex: hslToHex((h + 35) % 360, sat, lum),
      hueOffset: 35,
    },
    {
      name: 'Analogous (Cool)',
      role: '-35° Flow gradient',
      hex: hslToHex((h - 35 + 360) % 360, sat, lum),
      hueOffset: -35,
    },
    {
      name: 'Triadic Accent',
      role: '+120° Tri-tone chord',
      hex: hslToHex((h + 120) % 360, sat, lum),
      hueOffset: 120,
    },
  ];
}
