/**
 * Media uploads: Cloudflare R2 via Worker (preferred) or S3-compatible API.
 */

import { createHmac, createHash } from 'crypto';

function sha256(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest();
}

function amzDate(d = new Date()): { amz: string; date: string } {
  const iso = d.toISOString().replace(/[:-]|\.\d{3}/g, '');
  return { amz: iso, date: iso.slice(0, 8) };
}

/** Worker path: PUT /upload?key=… with X-Upload-Secret */
export function isR2WorkerConfigured(): boolean {
  return Boolean(
    process.env.R2_WORKER_URL?.trim() && process.env.R2_UPLOAD_SECRET?.trim(),
  );
}

/** Classic S3 API against R2 */
export function isR2S3Configured(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID?.trim() &&
      process.env.R2_ACCESS_KEY_ID?.trim() &&
      process.env.R2_SECRET_ACCESS_KEY?.trim() &&
      process.env.R2_BUCKET_NAME?.trim() &&
      process.env.R2_PUBLIC_URL?.trim(),
  );
}

export function isR2Configured(): boolean {
  return isR2WorkerConfigured() || isR2S3Configured();
}

async function uploadViaWorker(opts: {
  key: string;
  body: Buffer;
  contentType: string;
}): Promise<string> {
  const base = process.env.R2_WORKER_URL!.replace(/\/$/, '');
  const secret = process.env.R2_UPLOAD_SECRET!;
  const url = `${base}/upload?key=${encodeURIComponent(opts.key)}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': opts.contentType,
      'X-Upload-Secret': secret,
      'Content-Length': String(opts.body.length),
    },
    body: opts.body,
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(
      `R2 worker upload failed (${res.status}): ${errText.slice(0, 200)}`,
    );
  }
  const data = (await res.json()) as { url?: string };
  if (data.url) return data.url;
  const publicBase = (
    process.env.R2_PUBLIC_URL || base
  ).replace(/\/$/, '');
  return `${publicBase}/${opts.key}`;
}

async function uploadViaS3(opts: {
  key: string;
  body: Buffer;
  contentType: string;
}): Promise<string> {
  const accountId = process.env.R2_ACCOUNT_ID!;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID!;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY!;
  const bucket = process.env.R2_BUCKET_NAME!;
  const publicUrl = process.env.R2_PUBLIC_URL!;

  const host = `${accountId}.r2.cloudflarestorage.com`;
  const region = 'auto';
  const service = 's3';
  const { amz, date } = amzDate();
  const payloadHash = sha256(opts.body);
  const canonicalUri = `/${bucket}/${opts.key
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`;
  const canonicalHeaders =
    `content-type:${opts.contentType}\n` +
    `host:${host}\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amz}\n`;
  const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = [
    'PUT',
    canonicalUri,
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const credentialScope = `${date}/${region}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amz,
    credentialScope,
    sha256(canonicalRequest),
  ].join('\n');

  const kDate = hmac(`AWS4${secretAccessKey}`, date);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, 'aws4_request');
  const signature = createHmac('sha256', kSigning)
    .update(stringToSign, 'utf8')
    .digest('hex');

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const url = `https://${host}${canonicalUri}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: authorization,
      'Content-Type': opts.contentType,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amz,
      'Content-Length': String(opts.body.length),
    },
    body: opts.body,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`R2 upload failed (${res.status}): ${errText.slice(0, 200)}`);
  }

  return `${publicUrl.replace(/\/$/, '')}/${opts.key}`;
}

export async function uploadToR2(opts: {
  key: string;
  body: Buffer;
  contentType: string;
}): Promise<string> {
  if (isR2WorkerConfigured()) return uploadViaWorker(opts);
  if (isR2S3Configured()) return uploadViaS3(opts);
  throw new Error('R2 is not configured');
}
