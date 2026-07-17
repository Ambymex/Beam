import type { CustomPathPart } from './shapes';

export interface ImportedSvgShape {
  viewBox: string;
  paths: CustomPathPart[];
}

function numericViewBox(svg: SVGElement): string {
  const raw = svg.getAttribute('viewBox');
  if (raw) {
    const nums = raw.trim().split(/[\s,]+/).map(Number);
    if (nums.length === 4 && nums.every(Number.isFinite) && nums[2] > 0 && nums[3] > 0) {
      return nums.join(' ');
    }
  }
  const width = Number.parseFloat(svg.getAttribute('width') ?? '');
  const height = Number.parseFloat(svg.getAttribute('height') ?? '');
  if (Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0) {
    return `0 0 ${width} ${height}`;
  }
  throw new Error('This SVG needs a viewBox (or numeric width and height) so Studio knows how to frame it.');
}

function isDefinitionPath(el: SVGPathElement, root: SVGElement): boolean {
  const hiddenContainers = new Set(['defs', 'clippath', 'mask', 'marker', 'pattern', 'symbol']);
  let parent: Element | null = el.parentElement;
  while (parent && parent !== root) {
    if (hiddenContainers.has(parent.localName.toLowerCase())) return true;
    parent = parent.parentElement;
  }
  const style = el.getAttribute('style') ?? '';
  return el.getAttribute('display') === 'none' || /display\s*:\s*none/i.test(style);
}

function transformChain(el: SVGPathElement, root: SVGElement): string | undefined {
  const transforms: string[] = [];
  let current: Element | null = el;
  while (current) {
    const transform = current.getAttribute('transform')?.trim();
    if (transform) transforms.unshift(transform);
    if (current === root) break;
    current = current.parentElement;
  }
  const joined = transforms.join(' ');
  // SVG transform attributes are declarative, but keep only the transform
  // grammar we actually expect from drawing programs.
  return joined && /^(?:(?:matrix|translate|scale|rotate|skewX|skewY)\s*\([^)]*\)\s*)+$/i.test(joined)
    ? joined
    : undefined;
}

function fillRuleFor(el: SVGPathElement): 'nonzero' | 'evenodd' | undefined {
  let current: Element | null = el;
  while (current) {
    const direct = current.getAttribute('fill-rule');
    const styled = (current.getAttribute('style') ?? '').match(/fill-rule\s*:\s*(nonzero|evenodd)/i)?.[1];
    const rule = (direct ?? styled)?.toLowerCase();
    if (rule === 'evenodd' || rule === 'nonzero') return rule;
    current = current.parentElement;
  }
  return undefined;
}

export function parseSvgShape(text: string): ImportedSvgShape {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  if (doc.querySelector('parsererror')) throw new Error('Studio could not read that file as SVG.');
  const root = doc.documentElement;
  if (root.localName.toLowerCase() !== 'svg') throw new Error('Choose an SVG file exported from a vector layer.');
  const svg = root as unknown as SVGElement;

  const all = Array.from(svg.querySelectorAll('path'));
  const paths: CustomPathPart[] = all
    .filter((el) => !isDefinitionPath(el, svg))
    .flatMap((el): CustomPathPart[] => {
      const d = el.getAttribute('d')?.trim() ?? '';
      return d ? [{
        d,
        transform: transformChain(el, svg),
        fillRule: fillRuleFor(el),
      }] : [];
    });

  if (!paths.length) {
    throw new Error('No visible paths were found. In Krita, export a vector shape—or convert the object to a path first.');
  }

  return { viewBox: numericViewBox(svg), paths };
}
