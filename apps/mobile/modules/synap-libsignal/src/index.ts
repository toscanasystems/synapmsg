export type LibsignalStatus = {
  native: boolean;
  implementation: string;
  version: string;
  protocol: string;
  identityPubLen?: number;
};

export type NativeKeyPair = {
  publicKey: string;
  privateKey: string;
};

type NativeLibsignal = {
  status(): Promise<LibsignalStatus>;
  generateIdentityKeyPair(): Promise<NativeKeyPair>;
  generateX25519KeyPair(): Promise<NativeKeyPair>;
  calculateAgreement(privateKeyB64: string, publicKeyB64: string): Promise<string>;
  hkdf(inputKeyB64: string, info: string, length: number): Promise<string>;
  aesGcmEncrypt(
    keyB64: string,
    plaintextB64: string,
    nonceB64: string,
  ): Promise<string>;
  aesGcmDecrypt(
    keyB64: string,
    ciphertextB64: string,
    nonceB64: string,
  ): Promise<string>;
  identityKeyFingerprint(publicKeyB64: string): Promise<string>;
};

function getNative(): NativeLibsignal | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { requireNativeModule } = require('expo-modules-core') as {
      requireNativeModule: <T>(name: string) => T;
    };
    return requireNativeModule<NativeLibsignal>('SynapLibsignal');
  } catch {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { NativeModulesProxy } = require('expo-modules-core') as {
        NativeModulesProxy: Record<string, NativeLibsignal | undefined>;
      };
      return NativeModulesProxy.SynapLibsignal ?? null;
    } catch {
      return null;
    }
  }
}

export function getLibsignalNative(): NativeLibsignal | null {
  return getNative();
}

export async function libsignalNativeStatus(): Promise<LibsignalStatus> {
  const n = getNative();
  if (!n?.status) {
    return {
      native: false,
      implementation: 'typescript-reference',
      version: '0',
      protocol: 'libsignal',
    };
  }
  try {
    return await n.status();
  } catch {
    return {
      native: false,
      implementation: 'load_failed',
      version: '0',
      protocol: 'libsignal',
    };
  }
}

export default { getLibsignalNative, libsignalNativeStatus };
