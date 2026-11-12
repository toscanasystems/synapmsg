package expo.modules.synapmlkittranslate

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.util.Log
import com.google.mlkit.common.model.DownloadConditions
import com.google.mlkit.common.model.RemoteModelManager
import com.google.mlkit.nl.translate.TranslateLanguage
import com.google.mlkit.nl.translate.TranslateRemoteModel
import com.google.mlkit.nl.translate.Translation
import com.google.mlkit.nl.translate.TranslatorOptions
import org.json.JSONObject
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

/**
 * Offline Private-MT proof without UI.
 * adb shell am broadcast -a com.synapmsg.app.action.PROVE_MLKIT \
 *   --ez download true|false --es phrase "..." --es glossary "Synapmsg" \
 *   --es source en --es target es
 */
class ProveMlkitReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != ACTION) return
    val pending = goAsync()
    Thread {
      try {
        val download = intent.getBooleanExtra("download", false)
        val phrase = intent.getStringExtra("phrase")
          ?: "The quantum refrigerator hummed beside the azure bicycle at dawn."
        val glossary = intent.getStringExtra("glossary") ?: "Synapmsg"
        val source = (intent.getStringExtra("source") ?: "en").take(2).lowercase()
        val target = (intent.getStringExtra("target") ?: "es").take(2).lowercase()
        val out = JSONObject()
        out.put("engine", "mlkit")
        out.put("deeplCalled", false)
        out.put("networkUsedForTranslate", false)
        out.put("source", source)
        out.put("target", target)
        out.put("phrase", phrase)
        out.put("glossary", glossary)

        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val netActive = cm.activeNetworkInfo?.isConnected == true
        out.put("networkActiveBefore", netActive)

        val srcLang = TranslateLanguage.fromLanguageTag(source)
        val tgtLang = TranslateLanguage.fromLanguageTag(target)
        if (srcLang == null || tgtLang == null) {
          out.put("ok", false)
          out.put("error", "UNSUPPORTED")
          Log.i(TAG, out.toString())
          return@Thread
        }

        val mgr = RemoteModelManager.getInstance()
        val srcModel = TranslateRemoteModel.Builder(srcLang).build()
        val tgtModel = TranslateRemoteModel.Builder(tgtLang).build()

        if (download) {
          val conditions = DownloadConditions.Builder().build()
          awaitTask(mgr.download(srcModel, conditions), 180)
          awaitTask(mgr.download(tgtModel, conditions), 180)
          out.put("downloaded", true)
        }

        val srcOk = awaitBool(mgr.isModelDownloaded(srcModel), 30)
        val tgtOk = awaitBool(mgr.isModelDownloaded(tgtModel), 30)
        out.put("srcDownloaded", srcOk)
        out.put("tgtDownloaded", tgtOk)
        if (!srcOk || !tgtOk) {
          out.put("ok", false)
          out.put("error", "MODEL_MISSING")
          Log.i(TAG, out.toString())
          return@Thread
        }

        // PUA markers survive ML Kit (ASCII placeholders get mangled).
        val token = "\uE000" + "0" + "\uE001"
        val input = if (phrase.contains(glossary)) {
          phrase.replace(glossary, token)
        } else {
          "$phrase $glossary".replace(glossary, token)
        }

        val options = TranslatorOptions.Builder()
          .setSourceLanguage(srcLang)
          .setTargetLanguage(tgtLang)
          .build()
        val translator = Translation.getClient(options)
        val translated = awaitTranslate(translator, input, 60)
        translator.close()

        val restored = translated.replace(token, glossary)
        out.put("translated", restored)
        out.put("glossaryPreserved", restored.contains(glossary))
        out.put(
          "ok",
          restored.isNotBlank() &&
            restored.contains(glossary) &&
            !restored.equals(phrase, ignoreCase = true),
        )
        out.put("networkActiveAfter", cm.activeNetworkInfo?.isConnected == true)
        Log.i(TAG, out.toString())
      } catch (e: Exception) {
        Log.e(TAG, JSONObject().put("ok", false).put("error", e.message ?: "exception").toString(), e)
      } finally {
        pending.finish()
      }
    }.start()
  }

  private fun <T> awaitTask(task: com.google.android.gms.tasks.Task<T>, seconds: Long): T {
    val latch = CountDownLatch(1)
    val ref = AtomicReference<T>()
    val err = AtomicReference<Exception>()
    task.addOnSuccessListener {
      ref.set(it)
      latch.countDown()
    }.addOnFailureListener {
      err.set(it)
      latch.countDown()
    }
    if (!latch.await(seconds, TimeUnit.SECONDS)) {
      throw RuntimeException("timeout")
    }
    err.get()?.let { throw it }
    @Suppress("UNCHECKED_CAST")
    return ref.get() as T
  }

  private fun awaitBool(task: com.google.android.gms.tasks.Task<Boolean>, seconds: Long): Boolean {
    return awaitTask(task, seconds) == true
  }

  private fun awaitTranslate(
    translator: com.google.mlkit.nl.translate.Translator,
    text: String,
    seconds: Long,
  ): String {
    val latch = CountDownLatch(1)
    val ref = AtomicReference<String>()
    val err = AtomicReference<Exception>()
    translator.translate(text)
      .addOnSuccessListener {
        ref.set(it)
        latch.countDown()
      }
      .addOnFailureListener {
        err.set(it)
        latch.countDown()
      }
    if (!latch.await(seconds, TimeUnit.SECONDS)) {
      throw RuntimeException("translate timeout")
    }
    err.get()?.let { throw it }
    return ref.get() ?: ""
  }

  companion object {
    const val ACTION = "com.synapmsg.app.action.PROVE_MLKIT"
    const val TAG = "SynapMlkitProve"
  }
}
