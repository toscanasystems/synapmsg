package expo.modules.synapmlkittranslate

import com.google.mlkit.common.model.DownloadConditions
import com.google.mlkit.common.model.RemoteModelManager
import com.google.mlkit.nl.languageid.LanguageIdentification
import com.google.mlkit.nl.translate.TranslateLanguage
import com.google.mlkit.nl.translate.TranslateRemoteModel
import com.google.mlkit.nl.translate.Translation
import com.google.mlkit.nl.translate.TranslatorOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class SynapMlkitTranslateModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("SynapMlkitTranslate")

    Function("engine") {
      mapOf(
        "name" to "mlkit",
        "platform" to "android",
        "native" to true
      )
    }

    Function("supportedLanguageCodes") {
      TranslateLanguage.getAllLanguages().toList()
    }

    AsyncFunction("isModelDownloaded") { languageCode: String, promise: Promise ->
      val tag = normalize(languageCode)
      val lang = TranslateLanguage.fromLanguageTag(tag)
      if (lang == null) {
        promise.resolve(false)
        return@AsyncFunction
      }
      val model = TranslateRemoteModel.Builder(lang).build()
      RemoteModelManager.getInstance()
        .isModelDownloaded(model)
        .addOnSuccessListener { promise.resolve(it) }
        .addOnFailureListener { e -> promise.reject("MODEL_CHECK", e.message, e) }
    }

    AsyncFunction("downloadModel") { languageCode: String, promise: Promise ->
      val tag = normalize(languageCode)
      val lang = TranslateLanguage.fromLanguageTag(tag)
      if (lang == null) {
        promise.reject("UNSUPPORTED", "Idioma no soportado por ML Kit: $languageCode", null)
        return@AsyncFunction
      }
      val model = TranslateRemoteModel.Builder(lang).build()
      val conditions = DownloadConditions.Builder().build()
      RemoteModelManager.getInstance()
        .download(model, conditions)
        .addOnSuccessListener { promise.resolve(true) }
        .addOnFailureListener { e -> promise.reject("DOWNLOAD", e.message, e) }
    }

    AsyncFunction("deleteModel") { languageCode: String, promise: Promise ->
      val tag = normalize(languageCode)
      val lang = TranslateLanguage.fromLanguageTag(tag)
      if (lang == null) {
        promise.resolve(false)
        return@AsyncFunction
      }
      val model = TranslateRemoteModel.Builder(lang).build()
      RemoteModelManager.getInstance()
        .deleteDownloadedModel(model)
        .addOnSuccessListener { promise.resolve(true) }
        .addOnFailureListener { e -> promise.reject("DELETE", e.message, e) }
    }

    AsyncFunction("identifyLanguage") { text: String, promise: Promise ->
      val client = LanguageIdentification.getClient()
      client.identifyLanguage(text)
        .addOnSuccessListener { code ->
          promise.resolve(if (code == "und") null else code)
          client.close()
        }
        .addOnFailureListener { e ->
          client.close()
          promise.reject("IDENTIFY", e.message, e)
        }
    }

    /**
     * On-device translate. Requires source + target models already on device.
     * Never downloads here — Private chats must stay honest offline.
     */
    AsyncFunction("translate") { text: String, sourceLang: String, targetLang: String, promise: Promise ->
      val srcTag = normalize(sourceLang)
      val tgtTag = normalize(targetLang)
      if (srcTag == tgtTag) {
        promise.resolve(
          mapOf(
            "text" to text,
            "sourceLanguage" to srcTag,
            "targetLanguage" to tgtTag,
            "via" to "mlkit",
            "unchanged" to true
          )
        )
        return@AsyncFunction
      }
      val src = TranslateLanguage.fromLanguageTag(srcTag)
      val tgt = TranslateLanguage.fromLanguageTag(tgtTag)
      if (src == null || tgt == null) {
        promise.reject(
          "UNSUPPORTED",
          "Par de idiomas no soportado: $sourceLang → $targetLang",
          null
        )
        return@AsyncFunction
      }

      val mgr = RemoteModelManager.getInstance()
      val srcModel = TranslateRemoteModel.Builder(src).build()
      val tgtModel = TranslateRemoteModel.Builder(tgt).build()

      mgr.isModelDownloaded(srcModel)
        .addOnSuccessListener { srcOk ->
          if (srcOk != true) {
            promise.reject(
              "MODEL_MISSING",
              "Falta el paquete de idioma \"$srcTag\". Se baja una vez. Después no sale del teléfono.",
              null
            )
            return@addOnSuccessListener
          }
          mgr.isModelDownloaded(tgtModel)
            .addOnSuccessListener { tgtOk ->
              if (tgtOk != true) {
                promise.reject(
                  "MODEL_MISSING",
                  "Falta el paquete de idioma \"$tgtTag\". Se baja una vez. Después no sale del teléfono.",
                  null
                )
                return@addOnSuccessListener
              }
              val options = TranslatorOptions.Builder()
                .setSourceLanguage(src)
                .setTargetLanguage(tgt)
                .build()
              val translator = Translation.getClient(options)
              translator.translate(text)
                .addOnSuccessListener { out ->
                  promise.resolve(
                    mapOf(
                      "text" to out,
                      "sourceLanguage" to srcTag,
                      "targetLanguage" to tgtTag,
                      "via" to "mlkit",
                      "unchanged" to false
                    )
                  )
                  translator.close()
                }
                .addOnFailureListener { e ->
                  translator.close()
                  promise.reject("TRANSLATE", e.message, e)
                }
            }
            .addOnFailureListener { e ->
              promise.reject("MODEL_CHECK", e.message, e)
            }
        }
        .addOnFailureListener { e ->
          promise.reject("MODEL_CHECK", e.message, e)
        }
    }
  }

  private fun normalize(code: String): String {
    val c = code.trim().lowercase()
    return when {
      c.startsWith("zh") -> "zh"
      else -> c.take(2)
    }
  }
}
