/*
 * Pure audio-buffer operations. A "clip" is an array of Float32Array channels
 * of equal length. Every function returns new arrays and never mutates its
 * input, so clips can be shared freely (clipboard, undo history, duplicates).
 */
(function (global) {
  'use strict';

  function length(chs) {
    return chs.length ? chs[0].length : 0;
  }

  function empty(numChannels, len) {
    return Array.from({ length: numChannels }, () => new Float32Array(len || 0));
  }

  /** Adapt a clip to `n` channels (downmix to mono, or upmix by repeating). */
  function conform(chs, n) {
    if (chs.length === n) return chs;
    if (n === 1) {
      const out = new Float32Array(length(chs));
      for (const ch of chs) for (let i = 0; i < out.length; i++) out[i] += ch[i];
      for (let i = 0; i < out.length; i++) out[i] /= chs.length;
      return [out];
    }
    return Array.from({ length: n }, (_, i) => chs[i % chs.length]);
  }

  function slice(chs, a, b) {
    return chs.map((c) => c.slice(a, b));
  }

  function remove(chs, a, b) {
    return chs.map((c) => {
      const out = new Float32Array(c.length - (b - a));
      out.set(c.subarray(0, a));
      out.set(c.subarray(b), a);
      return out;
    });
  }

  function insert(chs, at, clip) {
    const k = conform(clip, chs.length);
    return chs.map((c, i) => {
      const add = k[i];
      const out = new Float32Array(c.length + add.length);
      out.set(c.subarray(0, at));
      out.set(add, at);
      out.set(c.subarray(at), at + add.length);
      return out;
    });
  }

  function replace(chs, a, b, clip) {
    return insert(remove(chs, a, b), a, clip);
  }

  function silence(chs, a, b) {
    return chs.map((c) => {
      const out = c.slice();
      out.fill(0, a, b);
      return out;
    });
  }

  /** Linear fade over [a, b). dir = 'in' | 'out'. */
  function fade(chs, a, b, dir) {
    const n = b - a;
    return chs.map((c) => {
      const out = c.slice();
      for (let i = 0; i < n; i++) {
        const p = n === 1 ? 1 : i / (n - 1);
        out[a + i] *= dir === 'in' ? p : 1 - p;
      }
      return out;
    });
  }

  function join(parts) {
    const n = parts[0].length;
    const total = parts.reduce((s, p) => s + length(p), 0);
    const out = empty(n, total);
    let off = 0;
    for (const p of parts) {
      for (let i = 0; i < n; i++) out[i].set(p[i], off);
      off += length(p);
    }
    return out;
  }

  /** Equal-power crossfade of the tail of `a` into the head of `b` over `x` samples. */
  function crossfade(a, b, x) {
    const la = length(a);
    return a.map((ca, i) => {
      const cb = b[i];
      const out = new Float32Array(la + cb.length - x);
      out.set(ca.subarray(0, la - x));
      for (let j = 0; j < x; j++) {
        const p = ((j + 0.5) / x) * (Math.PI / 2);
        out[la - x + j] = ca[la - x + j] * Math.cos(p) + cb[j] * Math.sin(p);
      }
      out.set(cb.subarray(x), la);
      return out;
    });
  }

  /**
   * Play clips one after another. `spacing` is in samples: positive inserts
   * silence between clips, negative overlaps them with a crossfade.
   */
  function concat(list, spacing) {
    const n = Math.max(...list.map((c) => c.length));
    let out = conform(list[0], n);
    for (let i = 1; i < list.length; i++) {
      const next = conform(list[i], n);
      if (spacing >= 0) {
        out = join(spacing > 0 ? [out, empty(n, spacing), next] : [out, next]);
      } else {
        const x = Math.min(-spacing, length(out), length(next));
        out = x > 0 ? crossfade(out, next, x) : join([out, next]);
      }
    }
    return out;
  }

  /** Overlay clips on top of each other; scales down if the sum would clip. */
  function mix(list) {
    const n = Math.max(...list.map((c) => c.length));
    const len = Math.max(...list.map(length));
    const out = empty(n, len);
    for (const clip of list) {
      const k = conform(clip, n);
      for (let i = 0; i < n; i++) {
        const o = out[i];
        const s = k[i];
        for (let j = 0; j < s.length; j++) o[j] += s[j];
      }
    }
    let peak = 0;
    for (const o of out) for (let j = 0; j < o.length; j++) peak = Math.max(peak, Math.abs(o[j]));
    const scaled = peak > 1;
    if (scaled) {
      const g = 0.999 / peak;
      for (const o of out) for (let j = 0; j < o.length; j++) o[j] *= g;
    }
    return { channels: out, scaled };
  }

  /** Encode a clip as a 16-bit PCM WAV file. */
  function encodeWav(chs, sampleRate) {
    const n = chs.length;
    const len = length(chs);
    const dataBytes = len * n * 2;
    const buf = new ArrayBuffer(44 + dataBytes);
    const v = new DataView(buf);
    const str = (off, s) => {
      for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i));
    };
    str(0, 'RIFF');
    v.setUint32(4, 36 + dataBytes, true);
    str(8, 'WAVE');
    str(12, 'fmt ');
    v.setUint32(16, 16, true);
    v.setUint16(20, 1, true);
    v.setUint16(22, n, true);
    v.setUint32(24, sampleRate, true);
    v.setUint32(28, sampleRate * n * 2, true);
    v.setUint16(32, n * 2, true);
    v.setUint16(34, 16, true);
    str(36, 'data');
    v.setUint32(40, dataBytes, true);
    let off = 44;
    for (let i = 0; i < len; i++) {
      for (let c = 0; c < n; c++) {
        const s = Math.max(-1, Math.min(1, chs[c][i]));
        v.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
        off += 2;
      }
    }
    return buf;
  }

  let crcTable = null;
  function crc32(bytes) {
    if (!crcTable) {
      crcTable = new Uint32Array(256);
      for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        crcTable[n] = c >>> 0;
      }
    }
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }

  /** Build an uncompressed ("stored") ZIP archive from [{name, data: Uint8Array}]. */
  function zip(files) {
    const enc = new TextEncoder();
    const locals = [];
    const centrals = [];
    let offset = 0;
    for (const f of files) {
      const name = enc.encode(f.name);
      const crc = crc32(f.data);
      const size = f.data.length;
      const local = new DataView(new ArrayBuffer(30 + name.length));
      local.setUint32(0, 0x04034b50, true);
      local.setUint16(4, 20, true);
      local.setUint16(6, 0x0800, true); // UTF-8 names
      local.setUint32(14, crc, true);
      local.setUint32(18, size, true);
      local.setUint32(22, size, true);
      local.setUint16(26, name.length, true);
      new Uint8Array(local.buffer).set(name, 30);
      const central = new DataView(new ArrayBuffer(46 + name.length));
      central.setUint32(0, 0x02014b50, true);
      central.setUint16(4, 20, true);
      central.setUint16(6, 20, true);
      central.setUint16(8, 0x0800, true);
      central.setUint32(16, crc, true);
      central.setUint32(20, size, true);
      central.setUint32(24, size, true);
      central.setUint16(28, name.length, true);
      central.setUint32(42, offset, true);
      new Uint8Array(central.buffer).set(name, 46);
      locals.push(new Uint8Array(local.buffer), f.data);
      centrals.push(new Uint8Array(central.buffer));
      offset += 30 + name.length + size;
    }
    const centralSize = centrals.reduce((s, c) => s + c.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, centralSize, true);
    end.setUint32(16, offset, true);
    const parts = [...locals, ...centrals, new Uint8Array(end.buffer)];
    const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
    let o = 0;
    for (const p of parts) {
      out.set(p, o);
      o += p.length;
    }
    return out;
  }

  const api = { length, empty, conform, slice, remove, insert, replace, silence, fade, concat, mix, encodeWav, zip };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.AudioOps = api;
})(typeof window !== 'undefined' ? window : globalThis);
