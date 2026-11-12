/**
 * UTF-8 encode/decode without TextEncoder / TextDecoder
 * (missing on this RN/Hermes release build).
 * Uses encodeURIComponent / decodeURIComponent so Spanish + emoji survive.
 */

/** text → UTF-8 bytes */
export function utf8ToBytes(text: string): Uint8Array {
  const uri = encodeURIComponent(text);
  const out: number[] = [];
  for (let i = 0; i < uri.length; i++) {
    const ch = uri.charAt(i);
    if (ch === '%') {
      out.push(parseInt(uri.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      out.push(ch.charCodeAt(0));
    }
  }
  return new Uint8Array(out);
}

/** UTF-8 bytes → text */
export function bytesToUtf8(buf: ArrayBuffer | Uint8Array): string {
  const bytes =
    buf instanceof Uint8Array
      ? buf
      : new Uint8Array(buf);
  let uri = '';
  for (let i = 0; i < bytes.length; i++) {
    const h = bytes[i]!.toString(16);
    uri += '%' + (h.length < 2 ? '0' + h : h);
  }
  return decodeURIComponent(uri);
}

export function utf8ToArrayBuffer(text: string): ArrayBuffer {
  const bytes = utf8ToBytes(text);
  // Copy into an exact-sized buffer (avoid sharing a larger ArrayBuffer view).
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}
