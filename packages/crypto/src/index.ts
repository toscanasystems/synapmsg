/**
 * @synapmsg/crypto — E2E public surface.
 * Signal Protocol (libsignal algorithms) + Synap PQ hybrid.
 */

export { LIBSIGNAL, libsignalStatus } from './libsignal';
export type { SignalIdentityKeyPair, SignalPreKeyBundle } from './libsignal';

export const CRYPTO_PROTOCOL = 'synapmsg-pq-v1' as const;

export const CRYPTO_STATUS = {
  protocol: CRYPTO_PROTOCOL,
  libsignal: true,
  libsignalNativeJni: false,
  hybridPq: 'ml-kem768',
  note:
    'Signal Protocol (X3DH+DR) shipped in mobile crypto; PQ hybrid ML-KEM768. Native libsignal-client JNI is next bind target.',
} as const;
