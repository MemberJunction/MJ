/**
 * Manages deprecation warnings for entities and entity fields.
 *
 * Features:
 * - Session-level tracking: Each warning shown once per session
 * - Debounced output: Groups warnings and displays after a quiet period
 * - Formatted output: Tree-structured, grouped by entity
 * - Configurable: Control debounce timing and behavior via options
 *
 * @example
 * ```typescript
 * const tracker = DeprecationWarningManager.Instance;
 * tracker.RecordEntityWarning('User Preferences', 'BaseEntity::constructor');
 * tracker.RecordFieldWarning('AI Prompts', 'OldField', 'AIPromptEntity::validate');
 * // Warnings will be flushed automatically after debounce period
 * ```
 */

/**
 * Configuration options for the deprecation warning system
 */
export interface DeprecationWarningConfig {
    /**
     * Time in milliseconds to wait after last warning before flushing output.
     * Default: 10000 (10 seconds)
     */
    DebounceMs: number;

    /**
     * If true, shows every occurrence of deprecated items (ignores session tracking).
     * Default: false (from env var MJ_SHOW_ALL_DEPRECATION_WARNINGS)
     */
    ShowAll: boolean;

    /**
     * If true, disables all deprecation warnings.
     * Default: false (from env var MJ_DISABLE_DEPRECATION_WARNINGS)
     */
    DisableWarnings: boolean;

    /**
     * If true, groups warnings and displays them in formatted tree structure.
     * If false, displays warnings immediately as they occur.
     * Default: true (from env var MJ_GROUP_DEPRECATION_WARNINGS)
     */
    GroupWarnings: boolean;
}

/**
 * Represents a pending entity deprecation warning
 */
interface PendingEntityWarning {
    entityName: string;
    callerNames: Set<string>;
}

/**
 * Represents a pending field deprecation warning
 */
interface PendingFieldWarning {
    entityName: string;
    fieldName: string;
    callerNames: Set<string>;
}

/**
 * Singleton class that manages deprecation warnings across the entire application session.
 * Tracks which warnings have been shown and batches them for clean, grouped output.
 */
export class DeprecationWarningManager {
    private static instance: DeprecationWarningManager;

    private warnedEntities: Set<string> = new Set();
    private warnedFields: Map<string, Set<string>> = new Map(); // entityName -> Set<fieldName>

    private pendingEntityWarnings: Map<string, PendingEntityWarning> = new Map();
    private pendingFieldWarnings: Map<string, PendingFieldWarning[]> = new Map(); // entityName -> array of field warnings

    private debounceTimer: NodeJS.Timeout | null = null;

    private config: DeprecationWarningConfig;

    private constructor() {
        // Initialize config from environment variables
        this.config = {
            DebounceMs: parseInt(process.env.MJ_DEPRECATION_DEBOUNCE_MS || '10000', 10),
            ShowAll: process.env.MJ_SHOW_ALL_DEPRECATION_WARNINGS === '1',
            DisableWarnings: process.env.MJ_DISABLE_DEPRECATION_WARNINGS === '1',
            GroupWarnings: process.env.MJ_GROUP_DEPRECATION_WARNINGS !== '0' // default true
        };
    }

    /**
     * Gets the singleton instance of the DeprecationWarningManager
     */
    public static get Instance(): DeprecationWarningManager {
        if (!DeprecationWarningManager.instance) {
            DeprecationWarningManager.instance = new DeprecationWarningManager();
        }
        return DeprecationWarningManager.instance;
    }

    /**
     * Updates the configuration for the deprecation warning system.
     * This allows runtime customization of behavior.
     */
    public UpdateConfig(config: Partial<DeprecationWarningConfig>): void {
        this.config = { ...this.config, ...config };
    }

    /**
     * Gets the current configuration
     */
    public GetConfig(): Readonly<DeprecationWarningConfig> {
        return { ...this.config };
    }

    /**
     * Records a deprecation warning for an entity.
     *
     * @param entityName - The name of the deprecated entity
     * @param callerName - The name of the caller (e.g., 'BaseEntity::constructor')
     * @returns true if this warning should be emitted immediately (when ShowAll is true)
     */
    public RecordEntityWarning(entityName: string, callerName: string): boolean {
        if (this.config.DisableWarnings) {
            return false;
        }

        const key = entityName;
        const alreadyWarned = this.warnedEntities.has(key);

        if (this.config.ShowAll) {
            // Emit immediately, don't track or queue
            console.warn(`Entity "${entityName}" is deprecated and should not be used as it could be removed in the future. (Called from: ${callerName})`);
            return true;
        }

        if (!this.config.GroupWarnings) {
            // Emit immediately if not grouping, but still track to avoid duplicates
            if (!alreadyWarned) {
                console.warn(`Entity "${entityName}" is deprecated and should not be used as it could be removed in the future. (Called from: ${callerName})`);
                this.warnedEntities.add(key);
            }
            return !alreadyWarned;
        }

        // Group warnings - only queue if we haven't warned about this entity yet
        if (!alreadyWarned) {
            this.warnedEntities.add(key);

            // Add to pending warnings
            if (!this.pendingEntityWarnings.has(key)) {
                this.pendingEntityWarnings.set(key, {
                    entityName,
                    callerNames: new Set()
                });
            }
            this.pendingEntityWarnings.get(key)!.callerNames.add(callerName);

            this.scheduleFlush();
            return true;
        }

        return false;
    }

    /**
     * Records a deprecation warning for an entity field.
     *
     * @param entityName - The name of the entity containing the deprecated field
     * @param fieldName - The name of the deprecated field
     * @param callerName - The name of the caller (e.g., 'AIPromptEntity::validate')
     * @returns true if this warning should be emitted immediately (when ShowAll is true)
     */
    public RecordFieldWarning(entityName: string, fieldName: string, callerName: string): boolean {
        if (this.config.DisableWarnings) {
            return false;
        }

        // Check if we've already warned about this specific field
        const entityFields = this.warnedFields.get(entityName);
        const alreadyWarned = entityFields?.has(fieldName) || false;

        if (this.config.ShowAll) {
            // Emit immediately, don't track or queue
            console.warn(`Entity Field "${entityName}.${fieldName}" is deprecated and should not be used as it could be removed in the future. (Called from: ${callerName})`);
            return true;
        }

        if (!this.config.GroupWarnings) {
            // Emit immediately if not grouping, but still track to avoid duplicates
            if (!alreadyWarned) {
                console.warn(`Entity Field "${entityName}.${fieldName}" is deprecated and should not be used as it could be removed in the future. (Called from: ${callerName})`);

                if (!this.warnedFields.has(entityName)) {
                    this.warnedFields.set(entityName, new Set());
                }
                this.warnedFields.get(entityName)!.add(fieldName);
            }
            return !alreadyWarned;
        }

        // Group warnings - only queue if we haven't warned about this field yet
        if (!alreadyWarned) {
            // Mark as warned
            if (!this.warnedFields.has(entityName)) {
                this.warnedFields.set(entityName, new Set());
            }
            this.warnedFields.get(entityName)!.add(fieldName);

            // Add to pending warnings
            if (!this.pendingFieldWarnings.has(entityName)) {
                this.pendingFieldWarnings.set(entityName, []);
            }

            const fieldWarnings = this.pendingFieldWarnings.get(entityName)!;
            let fieldWarning = fieldWarnings.find(fw => fw.fieldName === fieldName);

            if (!fieldWarning) {
                fieldWarning = {
                    entityName,
                    fieldName,
                    callerNames: new Set()
                };
                fieldWarnings.push(fieldWarning);
            }

            fieldWarning.callerNames.add(callerName);

            this.scheduleFlush();
            return true;
        }

        return false;
    }

    /**
     * Schedules a flush of pending warnings after the debounce period.
     * Resets the timer if new warnings arrive.
     */
    private scheduleFlush(): void {
        // Clear existing timer
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }

        // Schedule new flush
        this.debounceTimer = setTimeout(() => {
            this.flushWarnings();
        }, this.config.DebounceMs);
    }

    /**
     * Immediately flushes all pending warnings to the console.
     * Can be called manually to force output before the debounce period.
     */
    public FlushWarnings(): void {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }
        this.flushWarnings();
    }

    /**
     * Internal method that formats and outputs all pending warnings.
     */
    private flushWarnings(): void {
        const hasEntityWarnings = this.pendingEntityWarnings.size > 0;
        const hasFieldWarnings = this.pendingFieldWarnings.size > 0;

        if (!hasEntityWarnings && !hasFieldWarnings) {
            return; // Nothing to flush
        }

        // Build the formatted warning message
        const lines: string[] = [];
        lines.push('');
        lines.push('⚠️  DEPRECATION WARNINGS - The following entities/fields are deprecated and may be removed in future versions:');
        lines.push('');

        // Output entity warnings
        if (hasEntityWarnings) {
            lines.push('📦 ENTITIES:');
            const sortedEntities = Array.from(this.pendingEntityWarnings.values())
                .sort((a, b) => a.entityName.localeCompare(b.entityName));

            for (const warning of sortedEntities) {
                const callers = Array.from(warning.callerNames).sort().join(', ');
                lines.push(`  • "${warning.entityName}" (called from: ${callers})`);
            }
            lines.push('');
        }

        // Output field warnings
        if (hasFieldWarnings) {
            lines.push('📋 ENTITY FIELDS:');
            const sortedEntityNames = Array.from(this.pendingFieldWarnings.keys()).sort();

            for (let i = 0; i < sortedEntityNames.length; i++) {
                const entityName = sortedEntityNames[i];
                const fieldWarnings = this.pendingFieldWarnings.get(entityName)!;
                const isLast = i === sortedEntityNames.length - 1;
                const entityPrefix = isLast ? '└─' : '├─';

                lines.push(`  ${entityPrefix} "${entityName}"`);

                // Sort field warnings by field name
                const sortedFields = fieldWarnings.sort((a, b) => a.fieldName.localeCompare(b.fieldName));

                for (let j = 0; j < sortedFields.length; j++) {
                    const fieldWarning = sortedFields[j];
                    const isLastField = j === sortedFields.length - 1;
                    const fieldPrefix = isLastField ? '└─' : '├─';
                    const continuation = isLast ? ' ' : '│';
                    const callers = Array.from(fieldWarning.callerNames).sort().join(', ');

                    lines.push(`  ${continuation}  ${fieldPrefix} ${fieldWarning.fieldName} (called from: ${callers})`);
                }

                if (!isLast) {
                    lines.push(`  │`);
                }
            }
            lines.push('');
        }

        lines.push('Run with MJ_SHOW_ALL_DEPRECATION_WARNINGS=1 to see every occurrence.');
        lines.push('');

        // Output all lines at once
        console.warn(lines.join('\n'));

        // Clear pending warnings
        this.pendingEntityWarnings.clear();
        this.pendingFieldWarnings.clear();
    }

    /**
     * Resets all tracking state. Useful for testing or starting fresh.
     * Does NOT clear pending warnings - call FlushWarnings first if needed.
     */
    public Reset(): void {
        this.warnedEntities.clear();
        this.warnedFields.clear();
        this.pendingEntityWarnings.clear();
        this.pendingFieldWarnings.clear();

        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }
    }
}
