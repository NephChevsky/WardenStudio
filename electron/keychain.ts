import { safeStorage, app } from 'electron';
import Store from 'electron-store';
import crypto from 'crypto';
import log from 'electron-log';

/**
 * Secure key management using OS-level encryption (Keychain on macOS, Credential Vault on Windows, libsecret on Linux)
 * This is much more secure than storing keys in environment variables or config files
 * 
 * Security Benefits:
 * - Keys never appear in source code or config files
 * - OS-level encryption protects keys at rest
 * - Requires OS authentication to decrypt (on some platforms)
 * - Keys can't be extracted from application binary
 * - Automatic key generation on first run
 * 
 * Implementation Notes:
 * - Uses Electron's safeStorage API which wraps native OS keychain APIs
 * - Generates 256-bit (32 byte) AES keys using crypto.randomBytes
 * - Keys stored as 64-character hex strings
 * - Must be called after app.ready event
 */

const KEYCHAIN_STORE_NAME = 'warden-studio-keychain';
const ENCRYPTION_KEY_IDENTIFIER = 'app-encryption-key';

// Non-encrypted store just for storing the encrypted key blob
const keychainStore = new Store({
  name: KEYCHAIN_STORE_NAME,
  encryptionKey: undefined, // Don't encrypt this store, it contains encrypted data already
});

/**
 * Generate a cryptographically secure random encryption key
 */
function generateEncryptionKey(): string {
  // Generate 32 bytes (256 bits) for AES-256 encryption
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Get or create the encryption key using OS-level secure storage
 * This method will:
 * 1. Check if a key exists in the OS keychain
 * 2. If not, generate a new key and store it securely
 * 3. Return the decrypted key for use with electron-store
 */
export function getOrCreateEncryptionKey(): string {
  log.info('Retrieving encryption key from OS keychain...');

  // Check if safeStorage is available (should be after app.ready)
  if (!safeStorage.isEncryptionAvailable()) {
    log.error('OS-level encryption is not available on this system!');
    log.error('This is critical for security. The application cannot continue.');
    throw new Error('OS encryption not available. Cannot secure sensitive data.');
  }

  try {
    // Try to retrieve existing encrypted key
    const encryptedKeyBuffer = keychainStore.get(ENCRYPTION_KEY_IDENTIFIER) as Buffer | undefined;

    if (encryptedKeyBuffer) {
      log.info('Found existing encryption key in keychain, decrypting...');
      
      // Decrypt the key using OS-level encryption
      const decryptedKey = safeStorage.decryptString(Buffer.from(encryptedKeyBuffer));
      
      // Validate the key format (should be 64 hex characters for 32 bytes)
      if (decryptedKey && /^[a-f0-9]{64}$/.test(decryptedKey)) {
        log.info('Successfully retrieved and decrypted encryption key');
        return decryptedKey;
      } else {
        log.warn('Retrieved key is invalid format, generating new key...');
        // Fall through to generate new key
      }
    }

    // No existing key or invalid key - generate a new one
    log.info('No valid encryption key found, generating new key...');
    const newKey = generateEncryptionKey();

    // Encrypt the key using OS-level encryption before storing
    const encryptedBuffer = safeStorage.encryptString(newKey);

    // Store the encrypted key
    keychainStore.set(ENCRYPTION_KEY_IDENTIFIER, encryptedBuffer);
    
    log.info('New encryption key generated and stored securely in OS keychain');
    return newKey;

  } catch (error) {
    log.error('Failed to manage encryption key:', error);
    throw new Error(`Encryption key management failed: ${error}`);
  }
}

/**
 * Delete the encryption key from keychain (use with caution - will make existing encrypted data unrecoverable)
 */
export function deleteEncryptionKey(): void {
  log.warn('Deleting encryption key from keychain - encrypted data will become unrecoverable!');
  keychainStore.delete(ENCRYPTION_KEY_IDENTIFIER);
}

/**
 * Check if an encryption key exists in the keychain
 */
export function hasEncryptionKey(): boolean {
  return keychainStore.has(ENCRYPTION_KEY_IDENTIFIER);
}
