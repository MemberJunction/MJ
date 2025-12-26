/**
 * Encryption-related constants and utilities for MemberJunction.
 * These are placed in MJGlobal so any package can use them without
 * creating circular dependencies with the Encryption package.
 */

/**
 * The marker prefix used to identify encrypted values in the database.
 * Encrypted values are stored in the format: $ENC$<keyId>$<algorithm>$<iv>$<ciphertext>[$<authTag>]
 */
export const ENCRYPTION_MARKER = '$ENC$';

/**
 * Sentinel value returned to API clients when an encrypted field's value
 * cannot be disclosed (AllowDecryptInAPI=false and SendEncryptedValue=false).
 * This allows clients to distinguish between null/empty values and protected values.
 */
export const ENCRYPTED_SENTINEL = '[!ENCRYPTED$]';

/**
 * Checks if a string value is encrypted or is the encrypted sentinel.
 *
 * This function returns true if the value:
 * - Equals the encrypted sentinel (`[!ENCRYPTED$]`), indicating a protected value not disclosed to the client
 * - Starts with the encryption marker (default `$ENC$` or a custom marker if provided)
 *
 * @param value - The value to check
 * @param encryptionMarker - Optional custom encryption marker prefix. If not provided, uses the default `$ENC$`.
 *                           This allows for per-key markers as defined in the EncryptionKey entity's Marker field.
 * @returns True if the value is the encrypted sentinel or starts with the encryption marker, false otherwise
 *
 * @example
 * ```typescript
 * import { IsValueEncrypted, ENCRYPTION_MARKER } from '@memberjunction/global';
 *
 * const encrypted = '$ENC$keyId$AES-256-GCM$iv$ciphertext$authTag';
 * const customEncrypted = '$CUSTOM$keyId$AES-256-GCM$iv$ciphertext';
 * const sentinel = '[!ENCRYPTED$]';
 * const plaintext = 'Hello World';
 *
 * console.log(IsValueEncrypted(encrypted));                    // true
 * console.log(IsValueEncrypted(sentinel));                     // true
 * console.log(IsValueEncrypted(customEncrypted, '$CUSTOM$'));  // true
 * console.log(IsValueEncrypted(plaintext));                    // false
 * console.log(IsValueEncrypted(null));                         // false
 * console.log(IsValueEncrypted(''));                           // false
 * ```
 */
export function IsValueEncrypted(value: string | null | undefined, encryptionMarker?: string): boolean {
  if (!value || typeof value !== 'string') {
    return false;
  }
  return IsEncryptedSentinel(value) || value.startsWith(encryptionMarker || ENCRYPTION_MARKER);
}

/**
 * Checks if a value is the encrypted sentinel, indicating a protected value
 * that was not disclosed to the client.
 *
 * @param value - The value to check
 * @returns True if the value equals the encrypted sentinel, false otherwise
 *
 * @example
 * ```typescript
 * import { IsEncryptedSentinel, ENCRYPTED_SENTINEL } from '@memberjunction/global';
 *
 * console.log(IsEncryptedSentinel('[!ENCRYPTED$]')); // true
 * console.log(IsEncryptedSentinel('somevalue'));     // false
 * console.log(IsEncryptedSentinel(null));            // false
 * ```
 */
export function IsEncryptedSentinel(value: string | null | undefined): boolean {
  return value === ENCRYPTED_SENTINEL;
}

