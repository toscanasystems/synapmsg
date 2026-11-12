import ExpoModulesCore

/// iOS stub — SQLCipher CocoaPods bind lands with iOS GA.
public class SynapSqlCipherModule: Module {
  public func definition() -> ModuleDefinition {
    Name("SynapSqlCipher")

    AsyncFunction("status") { () -> [String: Any] in
      [
        "native": false,
        "engine": "ios-stub",
        "version": "pending",
        "open": false
      ]
    }

    AsyncFunction("open") { (_: String) -> Bool in
      false
    }

    AsyncFunction("close") { () -> Bool in true }

    AsyncFunction("exec") { (_: String) -> Bool in
      throw Exception(name: "SynapSqlCipher", description: "iOS SQLCipher pending")
    }

    AsyncFunction("upsert") { (_: String, _: String, _: String) -> Bool in
      throw Exception(name: "SynapSqlCipher", description: "iOS SQLCipher pending")
    }

    AsyncFunction("queryAll") { (_: String) -> [String] in
      []
    }

    AsyncFunction("deleteById") { (_: String, _: String) -> Bool in
      true
    }

    AsyncFunction("wipe") { () -> Bool in true }
  }
}
