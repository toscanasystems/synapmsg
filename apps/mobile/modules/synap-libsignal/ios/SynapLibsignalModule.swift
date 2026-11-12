import ExpoModulesCore

/// iOS stub — libsignal Cocoa bind lands with iOS GA.
public class SynapLibsignalModule: Module {
  public func definition() -> ModuleDefinition {
    Name("SynapLibsignal")

    AsyncFunction("status") { () -> [String: Any] in
      [
        "native": false,
        "implementation": "ios-stub",
        "version": "pending",
        "protocol": "libsignal"
      ]
    }

    AsyncFunction("generateIdentityKeyPair") { () -> [String: String] in
      throw Exception(name: "SynapLibsignal", description: "iOS libsignal pending")
    }

    AsyncFunction("generateX25519KeyPair") { () -> [String: String] in
      throw Exception(name: "SynapLibsignal", description: "iOS libsignal pending")
    }

    AsyncFunction("calculateAgreement") { (_: String, _: String) -> String in
      throw Exception(name: "SynapLibsignal", description: "iOS libsignal pending")
    }

    AsyncFunction("hkdf") { (_: String, _: String, _: Int) -> String in
      throw Exception(name: "SynapLibsignal", description: "iOS libsignal pending")
    }

    AsyncFunction("aesGcmEncrypt") { (_: String, _: String, _: String) -> String in
      throw Exception(name: "SynapLibsignal", description: "iOS libsignal pending")
    }

    AsyncFunction("aesGcmDecrypt") { (_: String, _: String, _: String) -> String in
      throw Exception(name: "SynapLibsignal", description: "iOS libsignal pending")
    }

    AsyncFunction("identityKeyFingerprint") { (_: String) -> String in
      throw Exception(name: "SynapLibsignal", description: "iOS libsignal pending")
    }
  }
}
