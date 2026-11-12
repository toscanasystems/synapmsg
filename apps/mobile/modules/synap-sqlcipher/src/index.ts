export type SqlCipherStatus = {
  native: boolean;
  engine: string;
  version: string;
  open: boolean;
};

type NativeSqlCipher = {
  status(): Promise<SqlCipherStatus>;
  open(passphrase: string): Promise<boolean>;
  close(): Promise<boolean>;
  exec(sql: string): Promise<boolean>;
  upsert(table: string, id: string, json: string): Promise<boolean>;
  queryAll(table: string): Promise<string[]>;
  deleteById(table: string, id: string): Promise<boolean>;
  wipe(): Promise<boolean>;
};

function getNative(): NativeSqlCipher | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { requireNativeModule } = require('expo-modules-core') as {
      requireNativeModule: <T>(name: string) => T;
    };
    return requireNativeModule<NativeSqlCipher>('SynapSqlCipher');
  } catch {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { NativeModulesProxy } = require('expo-modules-core') as {
        NativeModulesProxy: Record<string, NativeSqlCipher | undefined>;
      };
      return NativeModulesProxy.SynapSqlCipher ?? null;
    } catch {
      return null;
    }
  }
}

export function getSqlCipherNative(): NativeSqlCipher | null {
  return getNative();
}

export async function sqlCipherNativeStatus(): Promise<SqlCipherStatus> {
  const n = getNative();
  if (!n?.status) {
    return {
      native: false,
      engine: 'js-fallback',
      version: '0',
      open: false,
    };
  }
  return n.status();
}

export default { getSqlCipherNative, sqlCipherNativeStatus };
