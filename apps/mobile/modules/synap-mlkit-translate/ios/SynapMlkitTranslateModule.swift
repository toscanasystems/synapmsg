import ExpoModulesCore
import MLKitTranslate
import MLKitLanguageID

#if canImport(Translation)
import Translation
#endif

public class SynapMlkitTranslateModule: Module {
  public func definition() -> ModuleDefinition {
    Name("SynapMlkitTranslate")

    Function("engine") { () -> [String: Any] in
      return [
        "name": "apple+mlkit",
        "platform": "ios",
        "native": true
      ]
    }

    Function("supportedLanguageCodes") { () -> [String] in
      // Intersection candidate: ML Kit catalog (Apple subset is runtime-checked).
      return TranslateLanguage.allLanguages().map { $0.rawValue }
    }

    AsyncFunction("isModelDownloaded") { (languageCode: String, promise: Promise) in
      let tag = Self.normalize(languageCode)
      guard let lang = TranslateLanguage(rawValue: tag) else {
        promise.resolve(false)
        return
      }
      let model = TranslateRemoteModel.translateRemoteModel(language: lang)
      ModelManager.modelManager().isModelDownloaded(model)
        ? promise.resolve(true)
        : promise.resolve(false)
    }

    AsyncFunction("downloadModel") { (languageCode: String, promise: Promise) in
      let tag = Self.normalize(languageCode)
      guard let lang = TranslateLanguage(rawValue: tag) else {
        promise.reject("UNSUPPORTED", "Idioma no soportado: \(languageCode)")
        return
      }
      let model = TranslateRemoteModel.translateRemoteModel(language: lang)
      let conditions = ModelDownloadConditions(
        allowsCellularAccess: true,
        allowsBackgroundDownloading: false
      )
      ModelManager.modelManager().download(model, conditions: conditions)
      // ML Kit iOS download is notification-based; poll briefly.
      DispatchQueue.global().async {
        for _ in 0..<60 {
          if ModelManager.modelManager().isModelDownloaded(model) {
            promise.resolve(true)
            return
          }
          Thread.sleep(forTimeInterval: 0.5)
        }
        promise.reject("DOWNLOAD", "No se pudo bajar el paquete \(tag)")
      }
    }

    AsyncFunction("deleteModel") { (languageCode: String, promise: Promise) in
      let tag = Self.normalize(languageCode)
      guard let lang = TranslateLanguage(rawValue: tag) else {
        promise.resolve(false)
        return
      }
      let model = TranslateRemoteModel.translateRemoteModel(language: lang)
      do {
        try ModelManager.modelManager().deleteDownloadedModel(model)
        promise.resolve(true)
      } catch {
        promise.reject("DELETE", error.localizedDescription)
      }
    }

    AsyncFunction("identifyLanguage") { (text: String, promise: Promise) in
      let client = LanguageIdentification.languageIdentification()
      client.identifyLanguage(for: text) { code, error in
        if let error = error {
          promise.reject("IDENTIFY", error.localizedDescription)
          return
        }
        if code == "und" {
          promise.resolve(nil)
        } else {
          promise.resolve(code)
        }
      }
    }

    AsyncFunction("translate") { (text: String, sourceLang: String, targetLang: String, promise: Promise) in
      let srcTag = Self.normalize(sourceLang)
      let tgtTag = Self.normalize(targetLang)
      if srcTag == tgtTag {
        promise.resolve([
          "text": text,
          "sourceLanguage": srcTag,
          "targetLanguage": tgtTag,
          "via": "identity",
          "unchanged": true
        ])
        return
      }

      guard
        let src = TranslateLanguage(rawValue: srcTag),
        let tgt = TranslateLanguage(rawValue: tgtTag)
      else {
        promise.reject("UNSUPPORTED", "Par no soportado: \(sourceLang) → \(targetLang)")
        return
      }

      let srcModel = TranslateRemoteModel.translateRemoteModel(language: src)
      let tgtModel = TranslateRemoteModel.translateRemoteModel(language: tgt)
      let mgr = ModelManager.modelManager()
      if !mgr.isModelDownloaded(srcModel) {
        promise.reject(
          "MODEL_MISSING",
          "Falta el paquete de idioma \"\(srcTag)\". Se baja una vez. Después no sale del teléfono."
        )
        return
      }
      if !mgr.isModelDownloaded(tgtModel) {
        promise.reject(
          "MODEL_MISSING",
          "Falta el paquete de idioma \"\(tgtTag)\". Se baja una vez. Después no sale del teléfono."
        )
        return
      }

      let options = TranslatorOptions(sourceLanguage: src, targetLanguage: tgt)
      let translator = Translator.translator(options: options)
      translator.translate(text) { result, error in
        if let error = error {
          promise.reject("TRANSLATE", error.localizedDescription)
          return
        }
        promise.resolve([
          "text": result ?? text,
          "sourceLanguage": srcTag,
          "targetLanguage": tgtTag,
          "via": "mlkit",
          "unchanged": false
        ])
      }
    }
  }

  private static func normalize(_ code: String) -> String {
    let c = code.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    if c.hasPrefix("zh") { return "zh" }
    return String(c.prefix(2))
  }
}
