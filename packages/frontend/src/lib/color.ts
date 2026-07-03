/**
 * Converts an arbitrary CSS color string (hex, rgb(), hsl(), named color, ...)
 * into the bare "H S% L%" triplet format used by our Tailwind color tokens
 * (`hsl(var(--x))`). Resolution goes through the browser's own color parser
 * via canvas, so any valid CSS color syntax HA themes might use is supported
 * without a hand-rolled parser for each format.
 */
export function toHslTriplet(color: string): string | null {
  const rgb = normalizeToRgb(color);
  if (!rgb) return null;
  const [h, s, l] = rgbToHsl(rgb.r, rgb.g, rgb.b);
  return `${h} ${s}% ${l}%`;
}

let probeCanvas: HTMLCanvasElement | null = null;

function normalizeToRgb(color: string): { r: number; g: number; b: number } | null {
  if (!probeCanvas) {
    probeCanvas = document.createElement('canvas');
    probeCanvas.width = 1;
    probeCanvas.height = 1;
  }
  const ctx = probeCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  ctx.clearRect(0, 0, 1, 1);
  // Reset fillStyle before assigning so an invalid `color` doesn't silently
  // keep the previous probe's value.
  ctx.fillStyle = '#000000';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return { r, g, b };
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;

  if (max === min) {
    return [0, 0, Math.round(l * 100)];
  }

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  switch (max) {
    case rn:
      h = (gn - bn) / d + (gn < bn ? 6 : 0);
      break;
    case gn:
      h = (bn - rn) / d + 2;
      break;
    default:
      h = (rn - gn) / d + 4;
      break;
  }
  h *= 60;

  return [Math.round(h), Math.round(s * 100), Math.round(l * 100)];
}
