package expo.modules.synapsqlcipher

import android.content.Context
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import net.zetetic.database.sqlcipher.SQLiteDatabase
import java.io.File

/**
 * Native SQLCipher (NDK) store for Synap.
 * Rows: CREATE TABLE IF NOT EXISTS t (id TEXT PRIMARY KEY, json TEXT NOT NULL)
 */
class SynapSqlCipherModule : Module() {
  private var db: SQLiteDatabase? = null

  override fun definition() = ModuleDefinition {
    Name("SynapSqlCipher")

    OnDestroy {
      closeDb()
    }

    AsyncFunction("status") {
      mapOf(
        "native" to true,
        "engine" to "sqlcipher-android-ndk",
        "version" to "4.9.0",
        "open" to (db != null)
      )
    }

    AsyncFunction("open") { passphrase: String ->
      val ctx = appContext.reactContext ?: throw Exception("No Android context")
      openDb(ctx, passphrase)
      true
    }

    AsyncFunction("close") {
      closeDb()
      true
    }

    AsyncFunction("exec") { sql: String ->
      val d = db ?: throw Exception("SQLCipher not open")
      d.execSQL(sql)
      true
    }

    AsyncFunction("upsert") { table: String, id: String, json: String ->
      val d = db ?: throw Exception("SQLCipher not open")
      ensureTable(d, table)
      d.execSQL(
        "INSERT OR REPLACE INTO \"$table\" (id, json) VALUES (?, ?)",
        arrayOf<Any>(id, json)
      )
      true
    }

    AsyncFunction("queryAll") { table: String ->
      val d = db ?: throw Exception("SQLCipher not open")
      ensureTable(d, table)
      val out = mutableListOf<String>()
      d.rawQuery("SELECT json FROM \"$table\"", null).use { c ->
        while (c.moveToNext()) {
          out.add(c.getString(0))
        }
      }
      out
    }

    AsyncFunction("deleteById") { table: String, id: String ->
      val d = db ?: throw Exception("SQLCipher not open")
      ensureTable(d, table)
      d.execSQL("DELETE FROM \"$table\" WHERE id = ?", arrayOf<Any>(id))
      true
    }

    AsyncFunction("wipe") {
      val ctx = appContext.reactContext ?: throw Exception("No Android context")
      closeDb()
      val f = dbFile(ctx)
      if (f.exists()) f.delete()
      val wal = File(f.path + "-wal")
      val shm = File(f.path + "-shm")
      if (wal.exists()) wal.delete()
      if (shm.exists()) shm.delete()
      true
    }
  }

  private fun dbFile(ctx: Context): File =
    File(ctx.filesDir, "synap_sqlcipher_ndk.db")

  private fun openDb(ctx: Context, passphrase: String) {
    if (db != null) return
    System.loadLibrary("sqlcipher")
    val file = dbFile(ctx)
    db = SQLiteDatabase.openOrCreateDatabase(
      file.absolutePath,
      passphrase.toByteArray(Charsets.UTF_8),
      null,
      null
    )
    db?.execSQL("PRAGMA cipher_memory_security = ON")
  }

  private fun closeDb() {
    try {
      db?.close()
    } catch (_: Exception) {
    }
    db = null
  }

  private fun ensureTable(d: SQLiteDatabase, table: String) {
    val safe = table.replace(Regex("[^a-zA-Z0-9_]"), "_")
    if (safe != table) throw Exception("Invalid table name")
    d.execSQL(
      "CREATE TABLE IF NOT EXISTS \"$table\" (id TEXT PRIMARY KEY NOT NULL, json TEXT NOT NULL)"
    )
  }
}
