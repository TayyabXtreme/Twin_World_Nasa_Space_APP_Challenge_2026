/**
 * Minimal decoder for the base map's value grids: non-interlaced greyscale PNGs, 8 or 16 bits per sample.
 * Reading them through <canvas> would squash 16-bit data to 8 bits and may colour-manage the values, so the
 * bytes are inflated with the browser's DecompressionStream and un-filtered here.
 */

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function paeth(a: number, b: number, c: number) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

export async function decodeGreyPng(buf: ArrayBuffer): Promise<{ width: number; height: number; data: Uint8Array | Uint16Array }> {
  const bytes = new Uint8Array(buf);
  const view = new DataView(buf);
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!sig.every((v, i) => bytes[i] === v)) throw new Error("not a PNG");

  let width = 0;
  let height = 0;
  let depth = 0;
  const idat: Uint8Array[] = [];
  for (let p = 8; p < bytes.length; ) {
    const len = view.getUint32(p);
    const type = String.fromCharCode(bytes[p + 4], bytes[p + 5], bytes[p + 6], bytes[p + 7]);
    const body = bytes.subarray(p + 8, p + 8 + len);
    if (type === "IHDR") {
      width = view.getUint32(p + 8);
      height = view.getUint32(p + 12);
      depth = bytes[p + 16];
      const colour = bytes[p + 17];
      const interlace = bytes[p + 20];
      if (colour !== 0 || interlace !== 0 || (depth !== 8 && depth !== 16)) throw new Error("unsupported PNG layout");
    } else if (type === "IDAT") {
      idat.push(body);
    } else if (type === "IEND") {
      break;
    }
    p += 12 + len;
  }

  const total = idat.reduce((s, c) => s + c.length, 0);
  const joined = new Uint8Array(total);
  let o = 0;
  for (const c of idat) {
    joined.set(c, o);
    o += c.length;
  }
  const raw = await inflate(joined);

  const bpp = depth / 8;
  const stride = width * bpp;
  const out = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    const up = dst - stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[dst + x - bpp] : 0;
      const b = y > 0 ? out[up + x] : 0;
      const c = x >= bpp && y > 0 ? out[up + x - bpp] : 0;
      const v = raw[src + x];
      let r: number;
      switch (filter) {
        case 0: r = v; break;
        case 1: r = v + a; break;
        case 2: r = v + b; break;
        case 3: r = v + ((a + b) >> 1); break;
        case 4: r = v + paeth(a, b, c); break;
        default: throw new Error(`bad PNG filter ${filter}`);
      }
      out[dst + x] = r & 255;
    }
  }

  if (depth === 8) return { width, height, data: out };
  const data = new Uint16Array(width * height);
  for (let i = 0; i < data.length; i++) data[i] = (out[2 * i] << 8) | out[2 * i + 1];
  return { width, height, data };
}
