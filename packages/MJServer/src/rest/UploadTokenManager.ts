/**
 * @fileoverview Ephemeral in-memory staged upload token manager.
 *
 * Provides a secure, single-use, time-to-live (TTL) bounded staging area for raw
 * binary upload buffers received via REST streaming before being committed through
 * the GraphQL `UploadStorageFile` pipeline.
 *
 * Security properties:
 * - Single-use nonce: Token and buffer are atomically destroyed on first consumption.
 * - User binding: Tokens are bound to the authenticated User ID that uploaded them.
 * - Auto-eviction: Abandoned tokens are automatically evicted from RAM after the TTL.
 * - Memory caps: Enforces per-file max size (default 100MB) and total pool capacity (default 500MB).
 *
 * @module @memberjunction/server/rest/UploadTokenManager
 */

import { BaseSingleton, UUIDsEqual } from '@memberjunction/global';
import { LogError } from '@memberjunction/core';
import { randomBytes } from 'node:crypto';

/**
 * An ephemeral in-memory staged upload record.
 */
export interface StagedUploadEntry {
  token: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
  Buffer: Buffer;
  fileName: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
  mimeType: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
  ContentLength: number;
  userId: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
  CreatedAt: number;
  expiresAt: number;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
  Timer: NodeJS.Timeout;
}

/**
 * Ephemeral In-Memory Staged Upload Token Manager.
 *
 * Architecture & Deployment Topology Note:
 * This implementation maintains staged buffers in-process RAM with a 5-minute sliding TTL.
 * In a clustered/multi-replica deployment behind a load balancer, sticky sessions (or routing
 * the subsequent GraphQL `UploadStorageFile` commit to the same node) are recommended.
 * For shared-memory multi-node clustering, an external ephemeral store (such as Redis)
 * can be plugged in behind this interface.
 */
export class UploadTokenManager extends BaseSingleton<UploadTokenManager> {
  private readonly _staged = new Map<string, StagedUploadEntry>();
  private _totalMemoryBytes = 0;

  public DefaultTtlSeconds = 300;

  /** @deprecated Use {@link DefaultTtlSeconds}. */
  public get defaultTtlSeconds() {
    return this.DefaultTtlSeconds;
  }
  /** @deprecated Use {@link DefaultTtlSeconds}. */
  public set defaultTtlSeconds(value) {
    this.DefaultTtlSeconds = value;
  } // 5 minutes
  public MaxFileSizeBytes = 100 * 1024 * 1024;

  /** @deprecated Use {@link MaxFileSizeBytes}. */
  public get maxFileSizeBytes() {
    return this.MaxFileSizeBytes;
  }
  /** @deprecated Use {@link MaxFileSizeBytes}. */
  public set maxFileSizeBytes(value) {
    this.MaxFileSizeBytes = value;
  } // 100 MB
  public MaxUserMemoryBytes = 150 * 1024 * 1024;

  /** @deprecated Use {@link MaxUserMemoryBytes}. */
  public get maxUserMemoryBytes() {
    return this.MaxUserMemoryBytes;
  }
  /** @deprecated Use {@link MaxUserMemoryBytes}. */
  public set maxUserMemoryBytes(value) {
    this.MaxUserMemoryBytes = value;
  } // 150 MB per user
  public MaxPoolMemoryBytes = 500 * 1024 * 1024;

  /** @deprecated Use {@link MaxPoolMemoryBytes}. */
  public get maxPoolMemoryBytes() {
    return this.MaxPoolMemoryBytes;
  }
  /** @deprecated Use {@link MaxPoolMemoryBytes}. */
  public set maxPoolMemoryBytes(value) {
    this.MaxPoolMemoryBytes = value;
  } // 500 MB

  // Public constructor required by BaseSingleton
  public constructor() {
    super();
  }

  public static get Instance(): UploadTokenManager {
    return UploadTokenManager.getInstance<UploadTokenManager>();
  }

  /**
   * Calculates total active staged bytes currently held for a given user.
   */
  public GetUserMemoryBytes(userId: string): number {
    let total = 0;
    for (const entry of this._staged.values()) {
      if (UUIDsEqual(entry.userId, userId)) {
        total += entry.ContentLength;
      }
    }
    return total;
  }

  /**
   * Stages a raw binary buffer in RAM, returning a single-use cryptographic token.
   *
   * @throws Error if buffer exceeds single file limit, per-user quota, or global pool memory capacity.
   */
  public Stage(params: {
    buffer: Buffer;
    fileName: string;
    mimeType: string;
    userId: string;
    ttlSeconds?: number;
  }): string {
    const size = params.buffer.length;

    if (size > this.MaxFileSizeBytes) {
      throw new Error(
        `Staged upload exceeds maximum allowed file size of ${Math.round(this.MaxFileSizeBytes / (1024 * 1024))}MB (received ${Math.round(size / (1024 * 1024))}MB).`
      );
    }

    const userCurrentBytes = this.GetUserMemoryBytes(params.userId);
    if (userCurrentBytes + size > this.MaxUserMemoryBytes) {
      throw new Error(
        `Per-user upload memory quota reached (${Math.round(userCurrentBytes / (1024 * 1024))}MB / ${Math.round(this.MaxUserMemoryBytes / (1024 * 1024))}MB used). Please wait for active uploads to finalize.`
      );
    }

    if (this._totalMemoryBytes + size > this.MaxPoolMemoryBytes) {
      throw new Error(
        `Staged upload memory capacity reached (${Math.round(this._totalMemoryBytes / (1024 * 1024))}MB / ${Math.round(this.MaxPoolMemoryBytes / (1024 * 1024))}MB used). Please try again shortly.`
      );
    }

    const token = 'upt_' + randomBytes(32).toString('hex');
    const ttl = params.ttlSeconds || this.DefaultTtlSeconds;
    const now = Date.now();
    const expiresAt = now + ttl * 1000;

    const timer = setTimeout(() => {
      this.Evict(token);
    }, ttl * 1000);

    // Unref timer so it doesn't hold open process shutdown in tests or CLI
    if (typeof timer.unref === 'function') {
      timer.unref();
    }

    const entry: StagedUploadEntry = {
      token,
      Buffer: params.buffer,
      fileName: params.fileName,
      mimeType: params.mimeType,
      ContentLength: size,
      userId: params.userId,
      CreatedAt: now,
      expiresAt,
      Timer: timer,
    };

    this._staged.set(token, entry);
    this._totalMemoryBytes += size;

    return token;
  }

  /**
   * Atomically consumes and evicts a staged upload token.
   *
   * @param token The staged upload token.
   * @param claimingUserId The user ID claiming this token. If provided, must match the user who uploaded it.
   * @returns The staged buffer and metadata, or null if the token is invalid, expired, or claimed by the wrong user.
   */
  public Consume(
    token: string,
    claimingUserId?: string
  ): { buffer: Buffer; fileName: string; mimeType: string; contentLength: number } | null {
    if (!token || !this._staged.has(token)) {
      return null;
    }

    const entry = this._staged.get(token)!;

    // Security check: verify user ownership using UUIDsEqual for robust ID normalization
    if (claimingUserId && entry.userId && !UUIDsEqual(entry.userId, claimingUserId)) {
      LogError(`[UploadTokenManager] Security violation: User '${claimingUserId}' attempted to claim upload token owned by User '${entry.userId}'.`);
      // Evict immediately to prevent further probing
      this.Evict(token);
      return null;
    }

    // Atomic consumption & memory reclamation
    this.Evict(token);

    return {
      buffer: entry.Buffer,
      fileName: entry.fileName,
      mimeType: entry.mimeType,
      contentLength: entry.ContentLength,
    };
  }

  /**
   * Evicts a token from RAM and reclaims memory.
   */
  public Evict(token: string): boolean {
    const entry = this._staged.get(token);
    if (!entry) {
      return false;
    }

    clearTimeout(entry.Timer);
    this._staged.delete(token);
    this._totalMemoryBytes = Math.max(0, this._totalMemoryBytes - entry.ContentLength);
    return true;
  }

  /** Total RAM in bytes currently consumed by all active staged uploads. */
  public get TotalMemoryBytes(): number {
    return this._totalMemoryBytes;
  }

  /** Count of currently active staged uploads. */
  public get ActiveCount(): number {
    return this._staged.size;
  }

  /** Clears all active staged uploads. */
  public Clear(): void {
    for (const [, entry] of this._staged) {
      clearTimeout(entry.Timer);
    }
    this._staged.clear();
    this._totalMemoryBytes = 0;
  }
}
