export interface Env {
  MEDIA: R2Bucket;
  UPLOAD_SECRET: string;
  PUBLIC_BASE: string;
  /** Origin of the Synapmsg API (Railway). Used by /tunnel anti-censorship proxy. */
  API_ORIGIN?: string;
}

const DEFAULT_API = 'https://api.synapmsg.ai';

function corsHeaders(): HeadersInit {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, PUT, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers':
      'Authorization, Content-Type, X-Upload-Secret, X-Synap-Tunnel',
  };
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}

function apiOrigin(env: Env): string {
  return (env.API_ORIGIN || DEFAULT_API).replace(/\/$/, '');
}

/** Hop-by-hop / sensitive headers we never forward to origin. */
const SKIP_REQ = new Set([
  'host',
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
  'cf-connecting-ip',
  'cf-ipcountry',
  'cf-ray',
  'cf-visitor',
  'x-forwarded-for',
  'x-forwarded-proto',
  'x-real-ip',
]);

async function proxyToApi(
  request: Request,
  env: Env,
  tunnelPath: string,
): Promise<Response> {
  const origin = apiOrigin(env);
  const incoming = new URL(request.url);
  const targetUrl = `${origin}${tunnelPath}${incoming.search}`;

  // WebSocket upgrade — Cloudflare Workers can proxy WS.
  // Strip client IP headers so Railway sees the Worker hop, not the phone.
  if (request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
    const wsHeaders = new Headers();
    request.headers.forEach((value, key) => {
      const k = key.toLowerCase();
      if (
        k === 'cf-connecting-ip' ||
        k === 'cf-ipcountry' ||
        k === 'cf-ray' ||
        k === 'cf-visitor' ||
        k === 'x-forwarded-for' ||
        k === 'x-forwarded-proto' ||
        k === 'x-real-ip'
      ) {
        return;
      }
      wsHeaders.set(key, value);
    });
    const wsReq = new Request(targetUrl, {
      method: 'GET',
      headers: wsHeaders,
    });
    const upstream = await fetch(wsReq);
    return upstream;
  }

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (SKIP_REQ.has(key.toLowerCase())) return;
    headers.set(key, value);
  });
  headers.set('X-Synap-Tunnel', '1');

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: 'manual',
  };
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = request.body;
    // @ts-expect-error duplex required for streaming body in Workers
    init.duplex = 'half';
  }

  const upstream = await fetch(targetUrl, init);
  const outHeaders = new Headers(corsHeaders());
  upstream.headers.forEach((value, key) => {
    const k = key.toLowerCase();
    if (k === 'transfer-encoding' || k === 'connection') return;
    outHeaders.set(key, value);
  });
  // Do not set distinctive tunnel response headers (censor fingerprint).

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: outHeaders,
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    const url = new URL(request.url);

    // ── Anti-censorship tunnel: client → media.synapmsg.ai/tunnel/* → API
    // ISP/censor sees Cloudflare edge, not Railway API IP.
    if (url.pathname === '/tunnel' || url.pathname.startsWith('/tunnel/')) {
      const rest =
        url.pathname === '/tunnel' ? '/' : url.pathname.slice('/tunnel'.length);
      // Self-check only — do not shadow API /health.
      if (request.method === 'GET' && rest === '/__tunnel') {
        // Do not advertise API origin (helps censors fingerprint the tunnel).
        return json({ ok: true, service: 'synapmsg-tunnel' });
      }
      return proxyToApi(request, env, rest || '/');
    }

    // PUT /upload?key=chat/user/file.jpg  — API-only (shared secret)
    if (request.method === 'PUT' && url.pathname === '/upload') {
      const secret =
        request.headers.get('X-Upload-Secret') ||
        request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
      if (!env.UPLOAD_SECRET || !secret) {
        return json({ error: 'Unauthorized' }, 401);
      }
      if (secret.length !== env.UPLOAD_SECRET.length) {
        return json({ error: 'Unauthorized' }, 401);
      }
      let diff = 0;
      for (let i = 0; i < secret.length; i++) {
        diff |= secret.charCodeAt(i) ^ env.UPLOAD_SECRET.charCodeAt(i);
      }
      if (diff !== 0) return json({ error: 'Unauthorized' }, 401);
      const key = (url.searchParams.get('key') || '')
        .replace(/^\/+/, '')
        .replace(/\\/g, '/');
      if (
        !key ||
        key.includes('..') ||
        key.startsWith('/') ||
        key.includes('\\') ||
        key.length > 512
      ) {
        return json({ error: 'Invalid key' }, 400);
      }
      const contentType =
        request.headers.get('Content-Type') || 'application/octet-stream';
      const body = await request.arrayBuffer();
      if (!body.byteLength) return json({ error: 'Empty body' }, 400);
      if (body.byteLength > 110 * 1024 * 1024) {
        return json({ error: 'File too large' }, 413);
      }

      await env.MEDIA.put(key, body, {
        httpMetadata: { contentType },
      });

      const base = (env.PUBLIC_BASE || url.origin).replace(/\/$/, '');
      return json({
        ok: true,
        key,
        url: `${base}/${key}`,
        bytes: body.byteLength,
      });
    }

    // GET /health
    if (request.method === 'GET' && url.pathname === '/health') {
      return json({ ok: true, service: 'synapmsg-media' });
    }

    // GET|HEAD /* — public object serve (HEAD = same headers, empty body)
    if (request.method === 'GET' || request.method === 'HEAD') {
      const key = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
      if (!key || key.includes('..')) {
        return json({ error: 'Not found' }, 404);
      }

      if (request.method === 'HEAD') {
        const meta = await env.MEDIA.head(key);
        if (!meta) return json({ error: 'Not found' }, 404);
        const headers = new Headers(corsHeaders());
        headers.set(
          'Content-Type',
          meta.httpMetadata?.contentType || 'application/octet-stream',
        );
        headers.set('Cache-Control', 'public, max-age=31536000, immutable');
        if (meta.size != null) headers.set('Content-Length', String(meta.size));
        if (key.endsWith('.apk')) {
          headers.set(
            'Content-Disposition',
            `attachment; filename="${key.split('/').pop() || 'synap-android.apk'}"`,
          );
        }
        return new Response(null, { status: 200, headers });
      }

      const obj = await env.MEDIA.get(key);
      if (!obj) return json({ error: 'Not found' }, 404);

      const headers = new Headers(corsHeaders());
      headers.set(
        'Content-Type',
        obj.httpMetadata?.contentType || 'application/octet-stream',
      );
      headers.set('Cache-Control', 'public, max-age=31536000, immutable');
      if (obj.size != null) headers.set('Content-Length', String(obj.size));
      if (key.endsWith('.apk')) {
        headers.set(
          'Content-Disposition',
          `attachment; filename="${key.split('/').pop() || 'synap-android.apk'}"`,
        );
      }
      return new Response(obj.body, { status: 200, headers });
    }

    return json({ error: 'Method not allowed' }, 405);
  },
};
