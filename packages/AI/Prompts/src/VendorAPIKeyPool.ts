import { RateLimitTracker } from './RateLimitTracker';
import { APIKeyInfo } from '@memberjunction/ai-core-plus';
import { Metadata, RunView, UserInfo } from '@memberjunction/core';

/**
 * Manages multiple API keys for a single vendor with rate limit tracking
 *
 * This class handles:
 * - Loading API keys from database
 * - Selecting available keys based on capacity
 * - Tracking rate limits per key
 * - Calculating aggregate capacity across all keys
 *
 * Multiple API keys enable scaling beyond single-key rate limits.
 *
 * @example
 * ```typescript
 * const pool = new VendorAPIKeyPool('vendor-123');
 * await pool.initialize();
 *
 * // Select key with capacity
 * const keyInfo = pool.selectAvailableKey(50000);
 * if (keyInfo) {
 *   // Use key for request
 *   // ...
 *   // Record usage
 *   pool.recordUsage(keyInfo.id, 45000, 1);
 * }
 * ```
 */
export class VendorAPIKeyPool {
    /**
     * Vendor this pool manages keys for
     */
    private vendorId: string;

    /**
     * API keys with their rate limit trackers
     */
    private apiKeys: Map<string, APIKeyWithTracker> = new Map();

    /**
     * Round-robin index for balanced selection
     */
    private roundRobinIndex: number = 0;

    /**
     * Whether pool has been initialized
     */
    private initialized: boolean = false;

    /**
     * Creates a vendor API key pool
     *
     * @param vendorId - Vendor identifier
     */
    constructor(vendorId: string) {
        this.vendorId = vendorId;
    }

    /**
     * Initialize pool by loading API keys from database
     *
     * @param contextUser - User context for database access
     */
    public async initialize(contextUser?: UserInfo): Promise<void> {
        if (this.initialized) {
            return;
        }

        // Load API keys for this vendor
        const rv = new RunView();
        const result = await rv.RunView<AIVendorAPIKeyEntityType>({
            EntityName: 'AI Vendor API Keys',
            ExtraFilter: `VendorID='${this.vendorId}' AND IsActive=1`,
            OrderBy: 'Priority ASC',
            ResultType: 'entity_object'
        }, contextUser);

        if (!result.Success) {
            throw new Error(`Failed to load API keys for vendor ${this.vendorId}: ${result.ErrorMessage}`);
        }

        // Create tracker for each key
        for (const keyEntity of result.Results || []) {
            const tracker = new RateLimitTracker(
                keyEntity.RateLimitTPM,
                keyEntity.RateLimitRPM,
                keyEntity.RateLimitScope as 'ModelSpecific' | 'AllModels'
            );

            this.apiKeys.set(keyEntity.ID, {
                entity: keyEntity,
                tracker,
                activeRequests: 0
            });
        }

        this.initialized = true;
    }

    /**
     * Select an available API key that can accommodate the request
     *
     * Tries keys in priority order until one with sufficient capacity is found.
     *
     * @param estimatedTokens - Estimated tokens for the request
     * @param requestCount - Number of requests (default 1)
     * @returns API key info, or null if no key has capacity
     */
    public selectAvailableKey(estimatedTokens: number, requestCount: number = 1): APIKeyInfo | null {
        if (!this.initialized) {
            throw new Error('VendorAPIKeyPool not initialized');
        }

        // Get all active keys sorted by priority
        const keys = Array.from(this.apiKeys.values())
            .filter(k => k.entity.IsActive)
            .sort((a, b) => a.entity.Priority - b.entity.Priority);

        if (keys.length === 0) {
            return null;
        }

        // Try each key in priority order
        for (const keyWithTracker of keys) {
            if (keyWithTracker.tracker.canAccommodate(estimatedTokens, requestCount)) {
                return this.createAPIKeyInfo(keyWithTracker);
            }
        }

        return null;  // No key has capacity
    }

    /**
     * Select key using round-robin strategy
     *
     * Distributes load evenly across all keys.
     *
     * @param estimatedTokens - Estimated tokens for the request
     * @param requestCount - Number of requests (default 1)
     * @returns API key info, or null if no key has capacity
     */
    public selectRoundRobin(estimatedTokens: number, requestCount: number = 1): APIKeyInfo | null {
        if (!this.initialized) {
            throw new Error('VendorAPIKeyPool not initialized');
        }

        const keys = Array.from(this.apiKeys.values()).filter(k => k.entity.IsActive);

        if (keys.length === 0) {
            return null;
        }

        // Try keys starting from round-robin index
        for (let i = 0; i < keys.length; i++) {
            const index = (this.roundRobinIndex + i) % keys.length;
            const keyWithTracker = keys[index];

            if (keyWithTracker.tracker.canAccommodate(estimatedTokens, requestCount)) {
                // Update round-robin index for next call
                this.roundRobinIndex = (index + 1) % keys.length;
                return this.createAPIKeyInfo(keyWithTracker);
            }
        }

        return null;
    }

    /**
     * Select least-busy key
     *
     * Chooses key with fewest active requests.
     *
     * @param estimatedTokens - Estimated tokens for the request
     * @param requestCount - Number of requests (default 1)
     * @returns API key info, or null if no key has capacity
     */
    public selectLeastBusy(estimatedTokens: number, requestCount: number = 1): APIKeyInfo | null {
        if (!this.initialized) {
            throw new Error('VendorAPIKeyPool not initialized');
        }

        const keys = Array.from(this.apiKeys.values())
            .filter(k => k.entity.IsActive && k.tracker.canAccommodate(estimatedTokens, requestCount))
            .sort((a, b) => a.activeRequests - b.activeRequests);

        if (keys.length === 0) {
            return null;
        }

        return this.createAPIKeyInfo(keys[0]);
    }

    /**
     * Record usage for a specific key
     *
     * Updates rate limit trackers with actual usage.
     *
     * @param keyId - API key ID
     * @param tokens - Actual tokens used
     * @param requests - Number of requests (default 1)
     */
    public recordUsage(keyId: string, tokens: number, requests: number = 1): void {
        const key = this.apiKeys.get(keyId);
        if (key) {
            key.tracker.recordUsage(tokens, requests);
        }
    }

    /**
     * Increment active request count for a key
     *
     * @param keyId - API key ID
     */
    public incrementActiveRequests(keyId: string): void {
        const key = this.apiKeys.get(keyId);
        if (key) {
            key.activeRequests++;
        }
    }

    /**
     * Decrement active request count for a key
     *
     * @param keyId - API key ID
     */
    public decrementActiveRequests(keyId: string): void {
        const key = this.apiKeys.get(keyId);
        if (key) {
            key.activeRequests = Math.max(0, key.activeRequests - 1);
        }
    }

    /**
     * Get aggregate capacity across all keys
     *
     * @returns Total available tokens and requests
     */
    public getAggregateCapacity(): { availableTPM: number; availableRPM: number } {
        let totalTPM = 0;
        let totalRPM = 0;

        for (const key of this.apiKeys.values()) {
            if (!key.entity.IsActive) {
                continue;
            }

            const capacity = key.tracker.getAvailableCapacity();
            totalTPM += capacity.tokens;
            totalRPM += capacity.requests;
        }

        return { availableTPM: totalTPM, availableRPM: totalRPM };
    }

    /**
     * Get number of active API keys
     *
     * @returns Count of active keys
     */
    public getActiveKeyCount(): number {
        return Array.from(this.apiKeys.values()).filter(k => k.entity.IsActive).length;
    }

    /**
     * Get total number of active requests across all keys
     *
     * @returns Sum of active requests
     */
    public getTotalActiveRequests(): number {
        return Array.from(this.apiKeys.values())
            .filter(k => k.entity.IsActive)
            .reduce((sum, k) => sum + k.activeRequests, 0);
    }

    /**
     * Get statistics for all keys in pool
     *
     * @returns Array of key statistics
     */
    public getKeyStatistics(): KeyStatistics[] {
        return Array.from(this.apiKeys.entries()).map(([keyId, keyData]) => {
            const capacity = keyData.tracker.getAvailableCapacity();
            const usage = keyData.tracker.getCurrentUsage();

            return {
                keyId,
                keyName: keyData.entity.KeyName,
                priority: keyData.entity.Priority,
                isActive: keyData.entity.IsActive,
                activeRequests: keyData.activeRequests,
                availableTPM: capacity.tokens,
                availableRPM: capacity.requests,
                usedTPM: usage.tokensUsed,
                usedRPM: usage.requestsUsed,
                limitTPM: usage.limitTPM,
                limitRPM: usage.limitRPM,
                percentageUsedTPM: capacity.percentageUsedTPM,
                percentageUsedRPM: capacity.percentageUsedRPM
            };
        });
    }

    /**
     * Check if any key has capacity
     *
     * @param estimatedTokens - Estimated tokens for request
     * @param requestCount - Number of requests (default 1)
     * @returns True if at least one key can accommodate request
     */
    public hasCapacity(estimatedTokens: number, requestCount: number = 1): boolean {
        for (const key of this.apiKeys.values()) {
            if (key.entity.IsActive && key.tracker.canAccommodate(estimatedTokens, requestCount)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Get vendor ID
     *
     * @returns Vendor identifier
     */
    public getVendorId(): string {
        return this.vendorId;
    }

    /**
     * Reset all rate limit trackers
     *
     * Used for testing. Should not be used in production.
     */
    public reset(): void {
        for (const key of this.apiKeys.values()) {
            key.tracker.reset();
            key.activeRequests = 0;
        }
        this.roundRobinIndex = 0;
    }

    /**
     * Create APIKeyInfo from tracked key
     *
     * @param keyWithTracker - Key data with tracker
     * @returns API key info
     * @private
     */
    private createAPIKeyInfo(keyWithTracker: APIKeyWithTracker): APIKeyInfo {
        return {
            id: keyWithTracker.entity.ID,
            value: keyWithTracker.entity.APIKeyValue,
            vendorId: this.vendorId,
            name: keyWithTracker.entity.KeyName,
            priority: keyWithTracker.entity.Priority,
            rateLimitTPM: keyWithTracker.entity.RateLimitTPM,
            rateLimitRPM: keyWithTracker.entity.RateLimitRPM,
            rateLimitScope: keyWithTracker.entity.RateLimitScope as 'ModelSpecific' | 'AllModels',
            isActive: keyWithTracker.entity.IsActive
        };
    }
}

/**
 * API key with rate limit tracker
 *
 * @private
 */
interface APIKeyWithTracker {
    /**
     * API key entity from database
     */
    entity: AIVendorAPIKeyEntityType;

    /**
     * Rate limit tracker for this key
     */
    tracker: RateLimitTracker;

    /**
     * Number of active requests using this key
     */
    activeRequests: number;
}

/**
 * Simplified type for AIVendorAPIKey entity
 *
 * Actual entity will be generated by CodeGen after migration runs.
 */
interface AIVendorAPIKeyEntityType {
    ID: string;
    VendorID: string;
    KeyName: string;
    APIKeyValue: string;
    RateLimitTPM: number | null;
    RateLimitRPM: number | null;
    RateLimitScope: string;
    Priority: number;
    IsActive: boolean;
}

/**
 * Statistics for a single API key
 */
export interface KeyStatistics {
    /**
     * API key ID
     */
    keyId: string;

    /**
     * Key display name
     */
    keyName: string;

    /**
     * Priority level
     */
    priority: number;

    /**
     * Whether key is active
     */
    isActive: boolean;

    /**
     * Current active requests
     */
    activeRequests: number;

    /**
     * Available tokens per minute
     */
    availableTPM: number;

    /**
     * Available requests per minute
     */
    availableRPM: number;

    /**
     * Used tokens in current window
     */
    usedTPM: number;

    /**
     * Used requests in current window
     */
    usedRPM: number;

    /**
     * Configured TPM limit
     */
    limitTPM: number | null;

    /**
     * Configured RPM limit
     */
    limitRPM: number | null;

    /**
     * Percentage of TPM used (0-100)
     */
    percentageUsedTPM: number;

    /**
     * Percentage of RPM used (0-100)
     */
    percentageUsedRPM: number;
}
