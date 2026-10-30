import { inflateSync } from 'node:zlib';

export interface DecodedImage {
  width: number;
  height: number;
  /** RGBA, 8 bits per channel. */
  data: Uint8Array;
}

/** Minimal PNG decoder for the CLI: 8-bit, non-interlaced grayscale, RGB, palette, and alpha. Node only. */
export function decodePng(buf: Uint8Array): DecodedImage {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!sig.every((b, i) => buf[i] === b)) throw new Error('Not a PNG file');
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let pos = 8;
  let width = 0, height = 0, colorType = 0;
  let palette: Uint8Array | null = null;
  let trns: Uint8Array | null = null;
  const idat: Uint8Array[] = [];
  while (pos < buf.length) {
    const len = view.getUint32(pos);
    const type = String.fromCharCode(buf[pos + 4]!, buf[pos + 5]!, buf[pos + 6]!, buf[pos + 7]!);
    const body = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = view.getUint32(pos + 8);
      height = view.getUint32(pos + 12);
      const depth = buf[pos + 16]!;
      colorType = buf[pos + 17]!;
      if (depth !== 8) throw new Error(`Only 8-bit PNGs are supported (got ${depth}-bit)`);
      if (buf[pos + 20] !== 0) throw new Error('Interlaced PNGs are not supported');
    } else if (type === 'PLTE') palette = body;
    else if (type === 'tRNS') trns = body;
    else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error(`Unsupported PNG color type ${colorType}`);

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const lines = new Uint8Array(height * stride);
  let src = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[src++]!;
    const row = y * stride;
    for (let x = 0; x < stride; x++) {
      const v = raw[src++]!;
      const a = x >= channels ? lines[row + x - channels]! : 0;
      const b = y > 0 ? lines[row + x - stride]! : 0;
      const c = x >= channels && y > 0 ? lines[row + x - stride - channels]! : 0;
      let p = 0;
      if (filter === 1) p = a;
      else if (filter === 2) p = b;
      else if (filter === 3) p = (a + b) >> 1;
      else if (filter === 4) {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        p = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      lines[row + x] = (v + p) & 255;
    }
  }

  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const s = i * channels, d = i * 4;
    if (colorType === 0 || colorType === 4) {
      data[d] = data[d + 1] = data[d + 2] = lines[s]!;
      data[d + 3] = colorType === 4 ? lines[s + 1]! : 255;
    } else if (colorType === 3) {
      const k = lines[s]!;
      data[d] = palette![k * 3]!;
      data[d + 1] = palette![k * 3 + 1]!;
      data[d + 2] = palette![k * 3 + 2]!;
      data[d + 3] = trns && k < trns.length ? trns[k]! : 255;
    } else {
      data[d] = lines[s]!;
      data[d + 1] = lines[s + 1]!;
      data[d + 2] = lines[s + 2]!;
      data[d + 3] = colorType === 6 ? lines[s + 3]! : 255;
    }
  }
  return { width, height, data };
}
