/**
 * Local encrypted DB — prefers native SQLCipher NDK (Zetetic),
 * falls back to secretbox file-DB when native module missing.
 */

import * as FileSystem from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import nacl from 'tweetnacl';
import { getSqlCipherNative } from 'synap-sqlcipher';

const DB_DIR = `${FileSystem.documentDirectory ?? ''}synap_sqlcipher/`;
const DB_FILE = `${DB_DIR}messages.v1.db.enc`;
const DB_KEY = 'synapmsg_sqlcipher_v1';
const NDK_PASSPHRASE_KEY = 'synapmsg_sqlcipher_ndk_pass';
const SECURE_OPTS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  requireAuthentication: false,
};

type TableRow = Record<string, unknown>;
type DbShape = {
  v: 1;
  tables: Record<string, TableRow[]>;
};

let nativeOpen = false;
let nativePreferred: boolean | null = null;

function b64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return globalThis.btoa(s);
}

function unb64(s: string): Uint8Array {
  const bin = globalThis.atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function dbKey(): Promise<Uint8Array> {
  let raw = await SecureStore.getItemAsync(DB_KEY, SECURE_OPTS);
  if (!raw) {
    const key = nacl.randomBytes(nacl.secretbox.keyLength);
    raw = b64(key);
    await SecureStore.setItemAsync(DB_KEY, raw, SECURE_OPTS);
    return key;
  }
  return unb64(raw);
}

async function ndkPassphrase(): Promise<string> {
  let raw = await SecureStore.getItemAsync(NDK_PASSPHRASE_KEY, SECURE_OPTS);
  if (!raw) {
    const key = nacl.randomBytes(32);
    raw = b64(key);
    await SecureStore.setItemAsync(NDK_PASSPHRASE_KEY, raw, SECURE_OPTS);
  }
  return raw;
}

async function ensureNative(): Promise<boolean> {
  if (nativePreferred === false) return false;
  const n = getSqlCipherNative();
  if (!n?.open) {
    nativePreferred = false;
    return false;
  }
  if (nativeOpen) return true;
  try {
    const st = await n.status();
    if (!st.native) {
      nativePreferred = false;
      return false;
    }
    await n.open(await ndkPassphrase());
    nativeOpen = true;
    nativePreferred = true;
    return true;
  } catch {
    nativePreferred = false;
    nativeOpen = false;
    return false;
  }
}

async function ensureDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(DB_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(DB_DIR, { intermediates: true });
  }
}

async function readDb(): Promise<DbShape> {
  await ensureDir();
  const info = await FileSystem.getInfoAsync(DB_FILE);
  if (!info.exists) return { v: 1, tables: {} };
  const packed = await FileSystem.readAsStringAsync(DB_FILE);
  const [nB64, cB64] = packed.split('.');
  if (!nB64 || !cB64) return { v: 1, tables: {} };
  const opened = nacl.secretbox.open(unb64(cB64), unb64(nB64), await dbKey());
  if (!opened) return { v: 1, tables: {} };
  let s = '';
  for (let i = 0; i < opened.length; i++) s += String.fromCharCode(opened[i]!);
  try {
    return JSON.parse(decodeURIComponent(escape(s))) as DbShape;
  } catch {
    return { v: 1, tables: {} };
  }
}

async function writeDb(db: DbShape): Promise<void> {
  await ensureDir();
  const json = JSON.stringify(db);
  const msg = new Uint8Array(
    Array.from(unescape(encodeURIComponent(json))).map((c) => c.charCodeAt(0)),
  );
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const box = nacl.secretbox(msg, nonce, await dbKey());
  await FileSystem.writeAsStringAsync(DB_FILE, `${b64(nonce)}.${b64(box)}`);
}

export async function sqlUpsert(
  table: string,
  row: TableRow,
  idKey = 'id',
): Promise<void> {
  const id = String(row[idKey] ?? '');
  if (await ensureNative()) {
    const n = getSqlCipherNative()!;
    await n.upsert(table, id, JSON.stringify(row));
    return;
  }
  const db = await readDb();
  const rows = db.tables[table] ?? [];
  const next = rows.filter((r) => String(r[idKey]) !== id);
  next.push(row);
  db.tables[table] = next;
  await writeDb(db);
}

export async function sqlQuery(
  table: string,
  where?: (row: TableRow) => boolean,
): Promise<TableRow[]> {
  if (await ensureNative()) {
    const n = getSqlCipherNative()!;
    const raw = await n.queryAll(table);
    const rows = raw.map((j) => JSON.parse(j) as TableRow);
    return where ? rows.filter(where) : rows;
  }
  const db = await readDb();
  const rows = db.tables[table] ?? [];
  return where ? rows.filter(where) : rows.slice();
}

export async function sqlDelete(
  table: string,
  where: (row: TableRow) => boolean,
): Promise<number> {
  if (await ensureNative()) {
    const n = getSqlCipherNative()!;
    const raw = await n.queryAll(table);
    let removed = 0;
    for (const j of raw) {
      const row = JSON.parse(j) as TableRow;
      if (where(row)) {
        await n.deleteById(table, String(row.id ?? ''));
        removed += 1;
      }
    }
    return removed;
  }
  const db = await readDb();
  const rows = db.tables[table] ?? [];
  const kept = rows.filter((r) => !where(r));
  const removed = rows.length - kept.length;
  db.tables[table] = kept;
  await writeDb(db);
  return removed;
}

export async function sqlWipeAll(): Promise<void> {
  if (await ensureNative()) {
    const n = getSqlCipherNative()!;
    await n.wipe();
    nativeOpen = false;
  }
  await ensureDir();
  const info = await FileSystem.getInfoAsync(DB_FILE);
  if (info.exists) await FileSystem.deleteAsync(DB_FILE, { idempotent: true });
  await SecureStore.deleteItemAsync(DB_KEY).catch(() => undefined);
  await SecureStore.deleteItemAsync(NDK_PASSPHRASE_KEY).catch(() => undefined);
}

export const SQLCIPHER_STATUS = {
  engine: 'synap-sqlcipher-ndk-or-file',
  nativeSqlCipher: true,
  note: 'Prefers Zetetic SQLCipher NDK (sqlcipher-android 4.9.0); secretbox file-DB fallback.',
} as const;
