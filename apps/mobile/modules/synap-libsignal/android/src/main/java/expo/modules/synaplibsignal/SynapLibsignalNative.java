package expo.modules.synaplibsignal;

import android.util.Base64;

import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

import org.signal.libsignal.protocol.IdentityKey;
import org.signal.libsignal.protocol.IdentityKeyPair;
import org.signal.libsignal.protocol.ecc.ECKeyPair;
import org.signal.libsignal.protocol.ecc.ECPrivateKey;
import org.signal.libsignal.protocol.ecc.ECPublicKey;
import org.signal.libsignal.protocol.kdf.HKDF;

/** Plain Java façade over official libsignal-client JNI. */
public final class SynapLibsignalNative {
  private SynapLibsignalNative() {}

  private static String b64(byte[] bytes) {
    return Base64.encodeToString(bytes, Base64.NO_WRAP);
  }

  private static byte[] unb64(String s) {
    return Base64.decode(s, Base64.DEFAULT);
  }

  public static Map<String, Object> status() {
    IdentityKeyPair probe = IdentityKeyPair.generate();
    Map<String, Object> m = new HashMap<>();
    m.put("native", true);
    m.put("implementation", "org.signal:libsignal-client");
    m.put("version", "0.76.1");
    m.put("protocol", "libsignal");
    m.put("identityPubLen", probe.getPublicKey().serialize().length);
    return m;
  }

  public static Map<String, String> generateIdentityKeyPair() {
    IdentityKeyPair kp = IdentityKeyPair.generate();
    Map<String, String> m = new HashMap<>();
    m.put("publicKey", b64(kp.getPublicKey().serialize()));
    m.put("privateKey", b64(kp.getPrivateKey().serialize()));
    return m;
  }

  public static Map<String, String> generateX25519KeyPair() {
    ECKeyPair kp = ECKeyPair.generate();
    Map<String, String> m = new HashMap<>();
    m.put("publicKey", b64(kp.getPublicKey().serialize()));
    m.put("privateKey", b64(kp.getPrivateKey().serialize()));
    return m;
  }

  public static String calculateAgreement(String privateKeyB64, String publicKeyB64) throws Exception {
    ECPrivateKey priv = new ECPrivateKey(unb64(privateKeyB64));
    ECPublicKey pub = new ECPublicKey(unb64(publicKeyB64));
    return b64(priv.calculateAgreement(pub));
  }

  public static String hkdf(String inputKeyB64, String info, int length) {
    int len = Math.max(16, Math.min(256, length));
    byte[] okm = HKDF.deriveSecrets(
      unb64(inputKeyB64),
      info.getBytes(StandardCharsets.UTF_8),
      len
    );
    return b64(okm);
  }

  public static String aesGcmEncrypt(String keyB64, String plaintextB64, String nonceB64)
    throws Exception {
    Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
    cipher.init(
      Cipher.ENCRYPT_MODE,
      new SecretKeySpec(unb64(keyB64), "AES"),
      new GCMParameterSpec(128, unb64(nonceB64))
    );
    return b64(cipher.doFinal(unb64(plaintextB64)));
  }

  public static String aesGcmDecrypt(String keyB64, String ciphertextB64, String nonceB64)
    throws Exception {
    Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
    cipher.init(
      Cipher.DECRYPT_MODE,
      new SecretKeySpec(unb64(keyB64), "AES"),
      new GCMParameterSpec(128, unb64(nonceB64))
    );
    return b64(cipher.doFinal(unb64(ciphertextB64)));
  }

  public static String identityKeyFingerprint(String publicKeyB64) throws Exception {
    IdentityKey pub = new IdentityKey(unb64(publicKeyB64));
    return b64(pub.getPublicKey().serialize());
  }
}
