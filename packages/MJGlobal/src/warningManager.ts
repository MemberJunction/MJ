/**
 * Manages various types of warnings across the MemberJunction system.
 *
 * Features:
 * - Session-level tracking: Each warning shown once per session
 * - Debounced output: Groups warnings and displays after a quiet period
 * - Formatted output: Tree-structured, grouped by entity and warning type
 * - Configurable: Control debounce timing and behavior via options
 * - Multiple warning types: Deprecation, field-not-found, and extensible for more
 *
 * @example
 * ```typescript
 * const wm = WarningManager.Instance;
 * wm.RecordEntityDeprecationWarning('User Preferences', 'BaseEntity::constructor');
 * wm.RecordFieldDeprecationWarning('AI Prompts', 'OldField', 'AIPromptEntity::validate');
 * wm.RecordFieldNotFoundWarning('Users', 'DeletedColumn', 'BaseEntity::SetMany');
 * // Warnings will be flushed automatically after debounce period
 * ```
 */

/**
 * Configuration options for the warning system
 */
export interface WarningConfig {
    /**
     * Time in milliseconds to wait after last warning before flushing output.
     * Default: 10000 (10 seconds)
     */
    DebounceMs: number;

    /**
     * If true, shows every occurrence of warnings (ignores session tracking).
     * Default: false (from env var MJ_SHOW_ALL_WARNINGS)
     */
    ShowAll: boolean;

    /**
     * If true, disables all warnings.
     * Default: false (from env var MJ_DISABLE_WARNINGS)
     */
    DisableWarnings: boolean;

    /**
     * If true, groups warnings and displays them in formatted tree structure.
     * If false, displays warnings immediately as they occur.
     * Default: true (from env var MJ_GROUP_WARNINGS)
     */
    GroupWarnings: boolean;
}

/**
 * Represents a pending entity deprecation warning
 */
interface PendingEntityDeprecationWarning {
    entityName: string;
    callerNames: Set<string>;
}

/**
 * Represents a pending field deprecation warning
 */
interface PendingFieldDeprecationWarning {
    entityName: string;
    fieldName: string;
    callerNames: Set<string>;
}

/**
 * Represents a pending field-not-found warning
 */
interface PendingFieldNotFoundWarning {
    entityName: string;
    fieldName: string;
    contexts: Set<string>; // e.g., "BaseEntity::SetMany", "data loading"
}

/**
 * Singleton class that manages warnings across the entire application session.
 * Tracks which warnings have been shown and batches them for clean, grouped output.
 */
export class WarningManager {
    private static instance: WarningManager;

    // Tracking for deprecation warnings
    private warnedDeprecatedEntities: Set<string> = new Set();
    private warnedDeprecatedFields: Map<string, Set<string>> = new Map(); // entityName -> Set<fieldName>

    // Tracking for field-not-found warnings
    private warnedFieldNotFound: Map<string, Set<string>> = new Map(); // entityName -> Set<fieldName>

    // Pending warnings by type
    private pendingEntityDeprecationWarnings: Map<string, PendingEntityDeprecationWarning> = new Map();
    private pendingFieldDeprecationWarnings: Map<string, PendingFieldDeprecationWarning[]> = new Map();
    private pendingFieldNotFoundWarnings: Map<string, PendingFieldNotFoundWarning[]> = new Map();

    private debounceTimer: NodeJS.Timeout | null = null;

    private config: WarningConfig;

    private constructor() {
        // Initialize config from environment variables
        // Support both old (MJ_DEPRECATION_*) and new (MJ_WARNING_*) env vars for backward compatibility
        this.config = {
            DebounceMs: parseInt(
                process.env.MJ_WARNING_DEBOUNCE_MS ||
                process.env.MJ_DEPRECATION_DEBOUNCE_MS ||
                '10000',
                10
            ),
            ShowAll:
                process.env.MJ_SHOW_ALL_WARNINGS === '1' ||
                process.env.MJ_SHOW_ALL_DEPRECATION_WARNINGS === '1',
            DisableWarnings:
                process.env.MJ_DISABLE_WARNINGS === '1' ||
                process.env.MJ_DISABLE_DEPRECATION_WARNINGS === '1',
            GroupWarnings:
                process.env.MJ_GROUP_WARNINGS !== '0' &&
                process.env.MJ_GROUP_DEPRECATION_WARNINGS !== '0' // default true
        };
    }

    /**
     * Gets the singleton instance of the WarningManager
     */
    public static get Instance(): WarningManager {
        if (!WarningManager.instance) {
            WarningManager.instance = new WarningManager();
        }
        return WarningManager.instance;
    }

    /**
     * Updates the configuration for the warning system.
     * This allows runtime customization of behavior.
     */
    public UpdateConfig(config: Partial<WarningConfig>): void {
        this.config = { ...this.config, ...config };
    }

    /**
     * Gets the current configuration
     */
    public GetConfig(): Readonly<WarningConfig> {
        return { ...this.config };
    }

    /**
     * Records a deprecation warning for an entity.
     *
     * @param entityName - The name of the deprecated entity
     * @param callerName - The name of the caller (e.g., 'BaseEntity::constructor')
     * @returns true if this warning should be emitted immediately (when ShowAll is true)
     */
    public RecordEntityDeprecationWarning(entityName: string, callerName: string): boolean {
        if (this.config.DisableWarnings) {
            return false;
        }

        const key = entityName;
        const alreadyWarned = this.warnedDeprecatedEntities.has(key);

        if (this.config.ShowAll) {
            // Emit immediately, don't track or queue
            console.warn(`Entity "${entityName}" is deprecated and should not be used as it could be removed in the future. (Called from: ${callerName})`);
            return true;
        }

        if (!this.config.GroupWarnings) {
            // Emit immediately if not grouping, but still track to avoid duplicates
            if (!alreadyWarned) {
                console.warn(`Entity "${entityName}" is deprecated and should not be used as it could be removed in the future. (Called from: ${callerName})`);
                this.warnedDeprecatedEntities.add(key);
            }
            return !alreadyWarned;
        }

        // Group warnings - only queue if we haven't warned about this entity yet
        if (!alreadyWarned) {
            this.warnedDeprecatedEntities.add(key);

            // Add to pending warnings
            if (!this.pendingEntityDeprecationWarnings.has(key)) {
                this.pendingEntityDeprecationWarnings.set(key, {
                    entityName,
                    callerNames: new Set()
                });
            }
            this.pendingEntityDeprecationWarnings.get(key)!.callerNames.add(callerName);

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
    public RecordFieldDeprecationWarning(entityName: string, fieldName: string, callerName: string): boolean {
        if (this.config.DisableWarnings) {
            return false;
        }

        // Check if we've already warned about this specific field
        const entityFields = this.warnedDeprecatedFields.get(entityName);
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

                if (!this.warnedDeprecatedFields.has(entityName)) {
                    this.warnedDeprecatedFields.set(entityName, new Set());
                }
                this.warnedDeprecatedFields.get(entityName)!.add(fieldName);
            }
            return !alreadyWarned;
        }

        // Group warnings - only queue if we haven't warned about this field yet
        if (!alreadyWarned) {
            // Mark as warned
            if (!this.warnedDeprecatedFields.has(entityName)) {
                this.warnedDeprecatedFields.set(entityName, new Set());
            }
            this.warnedDeprecatedFields.get(entityName)!.add(fieldName);

            // Add to pending warnings
            if (!this.pendingFieldDeprecationWarnings.has(entityName)) {
                this.pendingFieldDeprecationWarnings.set(entityName, []);
            }

            const fieldWarnings = this.pendingFieldDeprecationWarnings.get(entityName)!;
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
     * Records a warning when a field is not found in an entity definition.
     * This typically occurs during data loading when source data contains fields
     * that don't exist in the entity schema.
     *
     * @param entityName - The name of the entity where the field was not found
     * @param fieldName - The name of the field that was not found
     * @param context - Context description (e.g., 'BaseEntity::SetMany during data load')
     * @returns true if this warning should be emitted immediately (when ShowAll is true)
     */
    public RecordFieldNotFoundWarning(entityName: string, fieldName: string, context: string): boolean {
        if (this.config.DisableWarnings) {
            return false;
        }

        // Check if we've already warned about this specific field
        const entityFields = this.warnedFieldNotFound.get(entityName);
        const alreadyWarned = entityFields?.has(fieldName) || false;

        if (this.config.ShowAll) {
            // Emit immediately, don't track or queue
            console.warn(`Field "${fieldName}" does not exist on entity "${entityName}". Context: ${context}`);
            return true;
        }

        if (!this.config.GroupWarnings) {
            // Emit immediately if not grouping, but still track to avoid duplicates
            if (!alreadyWarned) {
                console.warn(`Field "${fieldName}" does not exist on entity "${entityName}". Context: ${context}`);

                if (!this.warnedFieldNotFound.has(entityName)) {
                    this.warnedFieldNotFound.set(entityName, new Set());
                }
                this.warnedFieldNotFound.get(entityName)!.add(fieldName);
            }
            return !alreadyWarned;
        }

        // Group warnings - only queue if we haven't warned about this field yet
        if (!alreadyWarned) {
            // Mark as warned
            if (!this.warnedFieldNotFound.has(entityName)) {
                this.warnedFieldNotFound.set(entityName, new Set());
            }
            this.warnedFieldNotFound.get(entityName)!.add(fieldName);

            // Add to pending warnings
            if (!this.pendingFieldNotFoundWarnings.has(entityName)) {
                this.pendingFieldNotFoundWarnings.set(entityName, []);
            }

            const fieldWarnings = this.pendingFieldNotFoundWarnings.get(entityName)!;
            let fieldWarning = fieldWarnings.find(fw => fw.fieldName === fieldName);

            if (!fieldWarning) {
                fieldWarning = {
                    entityName,
                    fieldName,
                    contexts: new Set()
                };
                fieldWarnings.push(fieldWarning);
            }

            fieldWarning.contexts.add(context);

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
        const hasEntityDeprecationWarnings = this.pendingEntityDeprecationWarnings.size > 0;
        const hasFieldDeprecationWarnings = this.pendingFieldDeprecationWarnings.size > 0;
        const hasFieldNotFoundWarnings = this.pendingFieldNotFoundWarnings.size > 0;

        if (!hasEntityDeprecationWarnings && !hasFieldDeprecationWarnings && !hasFieldNotFoundWarnings) {
            return; // Nothing to flush
        }

        const lines: string[] = [];

        // Output deprecation warnings if any
        if (hasEntityDeprecationWarnings || hasFieldDeprecationWarnings) {
            lines.push('');
            lines.push('⚠️  DEPRECATION WARNINGS - The following entities/fields are deprecated and may be removed in future versions:');
            lines.push('');

            // Output entity deprecation warnings
            if (hasEntityDeprecationWarnings) {
                lines.push('📦 DEPRECATED ENTITIES:');
                const sortedEntities = Array.from(this.pendingEntityDeprecationWarnings.values())
                    .sort((a, b) => a.entityName.localeCompare(b.entityName));

                for (const warning of sortedEntities) {
                    const callers = Array.from(warning.callerNames).sort().join(', ');
                    lines.push(`  • "${warning.entityName}" (called from: ${callers})`);
                }
                lines.push('');
            }

            // Output field deprecation warnings
            if (hasFieldDeprecationWarnings) {
                lines.push('📋 DEPRECATED ENTITY FIELDS:');
                const sortedEntityNames = Array.from(this.pendingFieldDeprecationWarnings.keys()).sort();

                for (let i = 0; i < sortedEntityNames.length; i++) {
                    const entityName = sortedEntityNames[i];
                    const fieldWarnings = this.pendingFieldDeprecationWarnings.get(entityName)!;
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

            lines.push('💡 Run with MJ_SHOW_ALL_WARNINGS=1 to see every occurrence.');
            lines.push('');
        }

        // Output field-not-found warnings if any
        if (hasFieldNotFoundWarnings) {
            lines.push('');
            lines.push('⚠️  DATA INTEGRITY WARNINGS - The following fields were not found in entity definitions:');
            lines.push('');
            lines.push('📋 MISSING FIELDS:');

            const sortedEntityNames = Array.from(this.pendingFieldNotFoundWarnings.keys()).sort();

            for (let i = 0; i < sortedEntityNames.length; i++) {
                const entityName = sortedEntityNames[i];
                const fieldWarnings = this.pendingFieldNotFoundWarnings.get(entityName)!;
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
                    const contexts = Array.from(fieldWarning.contexts).sort().join(', ');

                    lines.push(`  ${continuation}  ${fieldPrefix} ${fieldWarning.fieldName} (context: ${contexts})`);
                }

                if (!isLast) {
                    lines.push(`  │`);
                }
            }

            lines.push('');
            lines.push('💡 These fields exist in your data but not in the entity schema. This may indicate:');
            lines.push('   • Schema is out of sync with database');
            lines.push('   • Data contains legacy fields that were removed');
            lines.push('   • Field names have been changed');
            lines.push('');
        }

        // Output all lines at once
        console.warn(lines.join('\n'));

        // Clear pending warnings
        this.pendingEntityDeprecationWarnings.clear();
        this.pendingFieldDeprecationWarnings.clear();
        this.pendingFieldNotFoundWarnings.clear();
    }

    /**
     * Resets all tracking state. Useful for testing or starting fresh.
     * Does NOT clear pending warnings - call FlushWarnings first if needed.
     */
    public Reset(): void {
        this.warnedDeprecatedEntities.clear();
        this.warnedDeprecatedFields.clear();
        this.warnedFieldNotFound.clear();
        this.pendingEntityDeprecationWarnings.clear();
        this.pendingFieldDeprecationWarnings.clear();
        this.pendingFieldNotFoundWarnings.clear();

        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }
    }
}

/**
 * @deprecated Use WarningManager instead. This alias is provided for backward compatibility.
 */
export const DeprecationWarningManager = WarningManager;
