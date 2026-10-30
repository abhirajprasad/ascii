import { CellBuffer, CellGeometry, Look, SHAPE_DOT, SHAPE_NONE, SHAPE_RECT } from '../cells.js';
import { flatten, hex, RGB, unpack } from '../color.js';
import { Field } from '../field.js';
import { Ramp, ramp, RampName } from '../ramps.js';

/** Plain text. Drops all color: use a ramp-based style, since tile shapes have no text form. */
export function toText(cells: CellBuffer): string {
  const lines: string[] = [];
  for (let row = 0; row < cells.rows; row++) {
    let line = '';
    for (let col = 0; col < cells.cols; col++) {
      const code = cells.glyph[row * cells.cols + col]!;
      line += code ? String.fromCodePoint(code) : ' ';
    }
    lines.push(line.trimEnd());
  }
  return lines.join('\n');
}

/**
 * Plain ASCII of a Field at a text-friendly size, whatever style drew it. Dots and
 * tiles have no text form, so this reads tone straight from the Field.
 */
export function fieldToText(field: Field, options: { cols?: number; ramp?: RampName | string | Ramp; cellAspect?: number } = {}): string {
  const cols = Math.min(field.cols, options.cols ?? 100);
  const rmp = ramp(options.ramp ?? 'key');
  const worldW = field.viewAspect * 2;
  const rows = Math.max(1, Math.round((cols / worldW) * (2 / (options.cellAspect ?? 2))));
  const lines: string[] = [];
  for (let row = 0; row < rows; row++) {
    const y0 = Math.floor((row / rows) * field.rows), y1 = Math.max(y0 + 1, Math.floor(((row + 1) / rows) * field.rows));
    let line = '';
    for (let col = 0; col < cols; col++) {
      const x0 = Math.floor((col / cols) * field.cols), x1 = Math.max(x0 + 1, Math.floor(((col + 1) / cols) * field.cols));
      let sum = 0, count = 0;
      for (let y = y0; y < y1 && y < field.rows; y++) {
        for (let x = x0; x < x1 && x < field.cols; x++) {
          sum += field.luma(y * field.cols + x);
          count++;
        }
      }
      const v = count ? sum / count : 0;
      line += v < 0.04 ? ' ' : String.fromCodePoint(rmp.pick(v ** 0.8));
    }
    lines.push(line.trimEnd());
  }
  while (lines.length && !lines[0]) lines.shift();
  while (lines.length && !lines[lines.length - 1]) lines.pop();
  return lines.join('\n');
}

const ESC = '\x1b[';

/** 24-bit ANSI for terminals. Tiles become cell backgrounds, dots become full blocks. */
export function toAnsi(cells: CellBuffer, look: Pick<Look, 'background'>): string {
  const bg = safeHex(look.background);
  const base: [number, number, number] = [Math.round(bg[0] * 255), Math.round(bg[1] * 255), Math.round(bg[2] * 255)];
  let out = '';
  for (let row = 0; row < cells.rows; row++) {
    let curFg = -1, curBg = -1;
    for (let col = 0; col < cells.cols; col++) {
      const i = row * cells.cols + col;
      const hasFill = cells.shape[i] !== SHAPE_NONE && cells.fill[i] !== 0;
      const fillRgb = hasFill ? flatten(cells.fill[i]!, bg) : base;
      let code = cells.glyph[i]!;
      let fg: [number, number, number];
      if (cells.shape[i] === SHAPE_DOT && hasFill && !code) {
        code = 0x2588;
        fg = fillRgb;
      } else {
        const under: RGB = [fillRgb[0] / 255, fillRgb[1] / 255, fillRgb[2] / 255];
        fg = code ? flatten(cells.ink[i]!, under) : fillRgb;
      }
      const bgKey = cells.shape[i] === SHAPE_DOT ? (base[0] << 16) | (base[1] << 8) | base[2] : (fillRgb[0] << 16) | (fillRgb[1] << 8) | fillRgb[2];
      const fgKey = (fg[0] << 16) | (fg[1] << 8) | fg[2];
      if (bgKey !== curBg) {
        out += `${ESC}48;2;${(bgKey >> 16) & 255};${(bgKey >> 8) & 255};${bgKey & 255}m`;
        curBg = bgKey;
      }
      if (code && fgKey !== curFg) {
        out += `${ESC}38;2;${fg[0]};${fg[1]};${fg[2]}m`;
        curFg = fgKey;
      }
      out += code ? String.fromCodePoint(code) : ' ';
    }
    out += `${ESC}0m`;
    if (row < cells.rows - 1) out += '\n';
  }
  return out;
}

function safeHex(v: string): RGB {
  return v.startsWith('#') ? hex(v) : [0, 0, 0];
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function svgColor(c: number): string {
  const [r, g, b] = unpack(c);
  const h = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** Standalone SVG. Vector, so it stays sharp at poster size. */
export function toSvg(cells: CellBuffer, g: CellGeometry, look: Look): string {
  const W = cells.cols * g.cellW, H = cells.rows * g.cellH;
  const keyW = g.cellW * g.keyW, keyH = g.cellH * g.keyH;
  const padX = (g.cellW - keyW) / 2, padY = (g.cellH - keyH) / 2;
  const rx = g.radius * Math.min(keyW, keyH);
  const n = (v: number) => +v.toFixed(2);
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n(W)} ${n(H)}" font-family='${g.fontFamily}' font-weight="${g.fontWeight}" font-size="${n(g.cellH * g.fontSize)}" text-anchor="middle">`,
    `<rect width="100%" height="100%" fill="${look.background}"/>`,
  ];
  for (let i = 0; i < cells.n; i++) {
    const col = i % cells.cols, row = (i - col) / cells.cols;
    const fill = cells.fill[i]!;
    if (cells.shape[i] && fill) {
      const fo = (fill >>> 24) / 255;
      const opacity = fo < 1 ? ` fill-opacity="${fo.toFixed(2)}"` : '';
      if (cells.shape[i] === SHAPE_DOT) {
        const s = cells.size[i]!;
        const cx = n(col * g.cellW + g.cellW / 2), cy = n(row * g.cellH + g.cellH / 2);
        if (g.dot === 'round') {
          parts.push(`<circle cx="${cx}" cy="${cy}" r="${n((keyW * s) / 2)}" fill="${svgColor(fill)}"${opacity}/>`);
        } else {
          parts.push(`<rect x="${n(cx - (keyW * s) / 2)}" y="${n(cy - (keyH * s) / 2)}" width="${n(keyW * s)}" height="${n(keyH * s)}" fill="${svgColor(fill)}"${opacity}/>`);
        }
      } else {
        const corner = cells.shape[i] === SHAPE_RECT ? '' : ` rx="${n(rx)}"`;
        const line = cells.line[i]!;
        const stroke = line && g.lineWidth > 0
          ? ` stroke="${svgColor(line)}" stroke-opacity="${((line >>> 24) / 255).toFixed(2)}"`
          : '';
        parts.push(`<rect x="${n(col * g.cellW + padX)}" y="${n(row * g.cellH + padY)}" width="${n(keyW)}" height="${n(keyH)}"${corner} fill="${svgColor(fill)}"${opacity}${stroke}/>`);
      }
    }
    const code = cells.glyph[i]!;
    if (code && cells.ink[i]) {
      const ia = (cells.ink[i]! >>> 24) / 255;
      const opacity = ia < 1 ? ` fill-opacity="${ia.toFixed(2)}"` : '';
      parts.push(`<text x="${n(col * g.cellW + g.cellW / 2)}" y="${n(row * g.cellH + g.cellH * 0.68)}" fill="${svgColor(cells.ink[i]!)}"${opacity}>${esc(String.fromCodePoint(code))}</text>`);
    }
  }
  parts.push('</svg>');
  return parts.join('');
}

/** A `<pre>` of colored spans, for dropping selectable art into a page. */
export function toHtml(cells: CellBuffer, look: Pick<Look, 'background'>): string {
  const bg = safeHex(look.background);
  let out = `<pre style="margin:0;line-height:1;background:${look.background}">`;
  for (let row = 0; row < cells.rows; row++) {
    let open = -1;
    for (let col = 0; col < cells.cols; col++) {
      const i = row * cells.cols + col;
      const code = cells.glyph[i]!;
      if (!code) {
        if (open !== -1) { out += '</span>'; open = -1; }
        out += ' ';
        continue;
      }
      const c = flatten(cells.ink[i]!, bg);
      const key = (c[0] << 16) | (c[1] << 8) | c[2];
      if (key !== open) {
        if (open !== -1) out += '</span>';
        out += `<span style="color:rgb(${c[0]},${c[1]},${c[2]})">`;
        open = key;
      }
      out += esc(String.fromCodePoint(code));
    }
    if (open !== -1) out += '</span>';
    out += '\n';
  }
  return out + '</pre>';
}
