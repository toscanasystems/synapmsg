/**
 * Status surface for Signal Protocol wiring.
 */

import {
  LEGACY_PQ_RATCHET_DISABLED_FOR_NEW,
  SIGNAL_PROTOCOL,
} from './signal/constants';

export const LIBSIGNAL = {
  protocol: SIGNAL_PROTOCOL,
  implementation: '@privacyresearch/libsignal-protocol-typescript (libsignal algorithms)',
  nativeBindingOptional: true,
  legacyPqDisabledForNew: LEGACY_PQ_RATCHET_DISABLED_FOR_NEW,
  features: [
    'X3DH',
    'DoubleRatchet',
    'SignedPreKey',
    'OneTimePreKey',
    'SafetyNumber',
  ],
} as const;

export function libsignalStatus() {
  return {
    ...LIBSIGNAL,
    ready: true,
    note: 'New Private 1:1 chats use libsignal. synapmsg-pq-v1 is off for new encrypts.',
  };
}
