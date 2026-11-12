export type EnclaveProbe = {
  rooted: boolean;
  frida: boolean;
  emulator: boolean;
  debugger: boolean;
  strongBox: boolean;
  reasons: string[];
  native: boolean;
};

type NativeEnclave = {
  probe(): Promise<EnclaveProbe>;
  strongBoxAvailable(): Promise<boolean>;
};

function getNative(): NativeEnclave | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { requireNativeModule } = require('expo-modules-core') as {
      requireNativeModule: <T>(name: string) => T;
    };
    return requireNativeModule<NativeEnclave>('SynapEnclave');
  } catch {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { NativeModulesProxy } = require('expo-modules-core') as {
        NativeModulesProxy: Record<string, NativeEnclave | undefined>;
      };
      return NativeModulesProxy.SynapEnclave ?? null;
    } catch {
      return null;
    }
  }
}

export async function probeEnclave(): Promise<EnclaveProbe> {
  const native = getNative();
  if (!native?.probe) {
    return {
      rooted: false,
      frida: false,
      emulator: false,
      debugger: false,
      strongBox: false,
      reasons: ['native_module_missing'],
      native: false,
    };
  }
  const result = await native.probe();
  return { ...result, native: true };
}

export async function isStrongBoxAvailable(): Promise<boolean> {
  const native = getNative();
  if (!native?.strongBoxAvailable) return false;
  try {
    return await native.strongBoxAvailable();
  } catch {
    return false;
  }
}

export default { probeEnclave, isStrongBoxAvailable };
