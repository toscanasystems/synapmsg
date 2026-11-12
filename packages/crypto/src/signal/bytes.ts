export function bufToB64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  if (typeof btoa === 'function') return btoa(s);
  return Buffer.from(bytes).toString('base64');
}

export function b64ToBuf(b64: string): ArrayBuffer {
  if (typeof atob === 'function') {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out.buffer;
  }
  return Uint8Array.from(Buffer.from(b64, 'base64')).buffer;
}

export function utf8ToBuf(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer;
}

export function bufToUtf8(buf: ArrayBuffer): string {
  return new TextDecoder().decode(new Uint8Array(buf));
}
