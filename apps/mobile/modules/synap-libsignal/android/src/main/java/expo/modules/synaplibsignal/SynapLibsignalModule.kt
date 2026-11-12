package expo.modules.synaplibsignal

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Expo bridge — crypto runs in SynapLibsignalNative.java against libsignal JNI.
 */
class SynapLibsignalModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("SynapLibsignal")

    AsyncFunction("status") {
      SynapLibsignalNative.status()
    }

    AsyncFunction("generateIdentityKeyPair") {
      SynapLibsignalNative.generateIdentityKeyPair()
    }

    AsyncFunction("generateX25519KeyPair") {
      SynapLibsignalNative.generateX25519KeyPair()
    }

    AsyncFunction("calculateAgreement") { privateKeyB64: String, publicKeyB64: String ->
      SynapLibsignalNative.calculateAgreement(privateKeyB64, publicKeyB64)
    }

    AsyncFunction("hkdf") { inputKeyB64: String, info: String, length: Int ->
      SynapLibsignalNative.hkdf(inputKeyB64, info, length)
    }

    AsyncFunction("aesGcmEncrypt") { keyB64: String, plaintextB64: String, nonceB64: String ->
      SynapLibsignalNative.aesGcmEncrypt(keyB64, plaintextB64, nonceB64)
    }

    AsyncFunction("aesGcmDecrypt") { keyB64: String, ciphertextB64: String, nonceB64: String ->
      SynapLibsignalNative.aesGcmDecrypt(keyB64, ciphertextB64, nonceB64)
    }

    AsyncFunction("identityKeyFingerprint") { publicKeyB64: String ->
      SynapLibsignalNative.identityKeyFingerprint(publicKeyB64)
    }
  }
}
