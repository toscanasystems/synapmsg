import ExpoModulesCore
import LocalAuthentication
import Security

public class SynapEnclaveModule: Module {
  public func definition() -> ModuleDefinition {
    Name("SynapEnclave")

    AsyncFunction("probe") { () -> [String: Any] in
      var reasons: [String] = []
      let rooted = Self.isJailbroken(&reasons)
      let emulator = Self.isSimulator(&reasons)
      let strongBox = Self.secureEnclaveAvailable()

      return [
        "rooted": rooted,
        "frida": false,
        "emulator": emulator,
        "debugger": false,
        "strongBox": strongBox,
        "reasons": reasons,
        "native": true
      ]
    }

    AsyncFunction("strongBoxAvailable") { () -> Bool in
      Self.secureEnclaveAvailable()
    }
  }

  private static func isSimulator(_ reasons: inout [String]) -> Bool {
#if targetEnvironment(simulator)
    reasons.append("emulator")
    return true
#else
    return false
#endif
  }

  private static func isJailbroken(_ reasons: inout [String]) -> Bool {
    let paths = [
      "/Applications/Cydia.app",
      "/Library/MobileSubstrate/MobileSubstrate.dylib",
      "/bin/bash",
      "/usr/sbin/sshd",
      "/etc/apt",
      "/private/var/lib/apt/"
    ]
    for p in paths {
      if FileManager.default.fileExists(atPath: p) {
        reasons.append("jailbreak_path")
        return true
      }
    }
    return false
  }

  private static func secureEnclaveAvailable() -> Bool {
    return LAContext().canEvaluatePolicy(.deviceOwnerAuthentication, error: nil)
  }
}
