package expo.modules.synapenclave

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.Debug
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.BufferedReader
import java.io.File
import java.io.FileReader
import java.net.InetSocketAddress
import java.net.Socket
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.util.UUID

class SynapEnclaveModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("SynapEnclave")

    AsyncFunction("probe") {
      val ctx = appContext.reactContext ?: throw Exception("No Android context")
      val reasons = mutableListOf<String>()
      val rooted = isRooted(reasons)
      val frida = isFrida(reasons)
      val emulator = isEmulator(reasons)
      val debugger = Debug.isDebuggerConnected() || Debug.waitingForDebugger()
      if (debugger) reasons.add("debugger")
      val strongBox = strongBoxAvailable(ctx)

      mapOf(
        "rooted" to rooted,
        "frida" to frida,
        "emulator" to emulator,
        "debugger" to debugger,
        "strongBox" to strongBox,
        "reasons" to reasons,
        "native" to true
      )
    }

    AsyncFunction("strongBoxAvailable") {
      val ctx = appContext.reactContext ?: return@AsyncFunction false
      strongBoxAvailable(ctx)
    }
  }

  private fun isRooted(reasons: MutableList<String>): Boolean {
    val tags = Build.TAGS
    if (tags != null && tags.contains("test-keys")) {
      reasons.add("test_keys")
      return true
    }
    val paths = arrayOf(
      "/system/app/Superuser.apk",
      "/sbin/su",
      "/system/bin/su",
      "/system/xbin/su",
      "/data/local/xbin/su",
      "/data/local/bin/su",
      "/system/sd/xbin/su",
      "/system/bin/failsafe/su",
      "/data/local/su",
      "/su/bin/su",
      "/system/xbin/daemonsu",
      "/system/etc/init.d/99SuperSUDaemon",
      "/dev/com.koushikdutta.superuser.daemon"
    )
    for (p in paths) {
      if (File(p).exists()) {
        reasons.add("su_binary")
        return true
      }
    }
    return false
  }

  private fun isFrida(reasons: MutableList<String>): Boolean {
    // Default Frida server ports
    val ports = intArrayOf(27042, 27043)
    for (port in ports) {
      try {
        Socket().use { socket ->
          socket.connect(InetSocketAddress("127.0.0.1", port), 80)
          reasons.add("frida_port_$port")
          return true
        }
      } catch (_: Exception) {
        // closed = good
      }
    }

    // /proc/self/maps artifact scan
    try {
      BufferedReader(FileReader("/proc/self/maps")).use { reader ->
        var line: String?
        while (reader.readLine().also { line = it } != null) {
          val l = line!!.lowercase()
          if (l.contains("frida") || l.contains("gadget") || l.contains("xposed")) {
            reasons.add("frida_maps")
            return true
          }
        }
      }
    } catch (_: Exception) {
      // ignore
    }
    return false
  }

  private fun isEmulator(reasons: MutableList<String>): Boolean {
    val fingerprint = Build.FINGERPRINT
    val model = Build.MODEL
    val manufacturer = Build.MANUFACTURER
    val brand = Build.BRAND
    val device = Build.DEVICE
    val product = Build.PRODUCT
    val hardware = Build.HARDWARE

    val hit =
      fingerprint.startsWith("generic") ||
        fingerprint.startsWith("unknown") ||
        model.contains("google_sdk") ||
        model.contains("Emulator") ||
        model.contains("Android SDK built for x86") ||
        manufacturer.contains("Genymotion") ||
        (brand.startsWith("generic") && device.startsWith("generic")) ||
        product == "google_sdk" ||
        hardware.contains("goldfish") ||
        hardware.contains("ranchu") ||
        product.contains("sdk") ||
        product.contains("emulator")

    if (hit) reasons.add("emulator")
    return hit
  }

  private fun strongBoxAvailable(ctx: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) return false
    return try {
      val pm = ctx.packageManager
      if (!pm.hasSystemFeature(PackageManager.FEATURE_STRONGBOX_KEYSTORE)) {
        return false
      }
      val alias = "synap_sb_probe_${UUID.randomUUID()}"
      val kpg = KeyPairGenerator.getInstance(
        KeyProperties.KEY_ALGORITHM_EC,
        "AndroidKeyStore"
      )
      val spec = KeyGenParameterSpec.Builder(
        alias,
        KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY
      )
        .setDigests(KeyProperties.DIGEST_SHA256)
        .setIsStrongBoxBacked(true)
        .build()
      kpg.initialize(spec)
      kpg.generateKeyPair()
      val ks = KeyStore.getInstance("AndroidKeyStore")
      ks.load(null)
      ks.deleteEntry(alias)
      true
    } catch (_: Exception) {
      false
    }
  }
}
