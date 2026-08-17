import * as Crypto from 'expo-crypto'
import * as SecureStore from 'expo-secure-store'

/**
 * The database encryption key.
 *
 * SQLCipher encrypts the file; this decides who can open it. The key is generated once from the
 * system CSPRNG and lives in the **keychain**, which is hardware-backed on every device this
 * ships to and is not included in an unencrypted backup.
 *
 * `WHEN_UNLOCKED_THIS_DEVICE_ONLY` is chosen deliberately and it is the whole point:
 *
 *   - **`THIS_DEVICE_ONLY`** keeps the key out of iCloud Keychain, so restoring a backup onto
 *     someone else's phone restores an encrypted file and no way to open it. Without this, the
 *     encryption protects the file from everyone except the one adversary who has your iCloud
 *     password.
 *   - **`WHEN_UNLOCKED`** means the key is unreadable while the phone is locked. A device seized
 *     locked cannot be made to give up the ledger by attaching a cable.
 *
 * The consequence is stated rather than discovered: **a lost phone is a lost ledger.** There is
 * no recovery path and there is not supposed to be one — a recovery path is an alternative way
 * in, and an alternative way in is what you were encrypting against. Export is the backup, and
 * it is the user's to take.
 */

const KEY_ALIAS = 'raseed.db.key'

const OPTIONS = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }

/** 256 bits, hex-encoded. SQLCipher takes a passphrase; this one is not guessable. */
function generate(): string {
  const bytes = Crypto.getRandomBytes(32)
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * The key, creating it on first launch.
 *
 * **Synchronous**, which is not a shortcut — it is what lets the database stay synchronous.
 * `expo-secure-store` exposes `getItem`/`setItem` alongside the promise versions, and op-sqlite
 * is JSI, so the whole open path can remain a straight line. The alternative was making
 * `getConnection()` async and threading a promise through every screen and every query in the
 * app to fetch one string that is already in memory after the first call.
 *
 * Returns `null` when the keychain is unavailable — a real state on a simulator with a broken
 * keychain and on some managed devices. The caller decides what to do rather than being handed
 * a silent fallback, because the obvious fallback (open it unencrypted) is the feature failing
 * open, which is the one way an encryption feature must never fail.
 */
export function databaseKey(): string | null {
  try {
    const existing = SecureStore.getItem(KEY_ALIAS, OPTIONS)
    if (existing) return existing

    const fresh = generate()
    SecureStore.setItem(KEY_ALIAS, fresh, OPTIONS)
    return fresh
  } catch {
    return null
  }
}

/** Whether a key already exists — i.e. whether this device has ever run the encrypted build. */
export function hasDatabaseKey(): boolean {
  try {
    return SecureStore.getItem(KEY_ALIAS, OPTIONS) !== null
  } catch {
    return false
  }
}
