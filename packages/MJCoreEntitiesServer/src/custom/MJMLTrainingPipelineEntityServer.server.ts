import { BaseEntity, EntityInfo, IMetadataProvider, ValidationErrorInfo, ValidationErrorType, ValidationResult } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { MJMLTrainingPipelineEntity } from '@memberjunction/core-entities';
import {
    validateLeakageGuard,
    DOMINANCE_THRESHOLD_DEFAULT,
    type LeakageGuard,
    type LeakageGuardIssue,
    type LeakageGuardValidationContext,
    type SourceBinding,
} from '@memberjunction/predictive-studio-core';

/**
 * Server-side ML Training Pipeline entity. Its job is to make the leakage guard
 * impossible to disarm by accident.
 *
 * The guard's `DenyFields` list keeps target-leaking columns out of the feature
 * matrix. Its worst failure mode is silent: a deny entry that matches no column
 * looks exactly like a deny entry that is armed, so training "succeeds" on leaked
 * features and the model looks brilliant. That is precisely what happened when a
 * user pasted a bracketed list into the editor and got
 * `DenyFields: ["[CheckInTime", ..., "Status]"]` — the two most dangerous columns
 * were left completely unguarded, and the save was accepted.
 *
 * So this is the authoritative gate: nothing malformed, and nothing that matches
 * no real column, reaches the database. The rules themselves live in
 * `@memberjunction/predictive-studio-core` so the editor can apply the identical
 * checks at input time without the two ever drifting apart.
 */
@RegisterClass(BaseEntity, 'MJ: ML Training Pipelines')
export class MJMLTrainingPipelineEntityServer extends MJMLTrainingPipelineEntity {

    public override get DefaultSkipAsyncValidation(): boolean {
        return false;
    }

    public override async ValidateAsync(): Promise<ValidationResult> {
        const result = await super.ValidateAsync();
        if (!result.Success) return result;

        // Fast-path: the guard can only become newly unsound when the guard itself,
        // or the sources its entries are checked against, are being changed.
        if (!this.needsLeakageGuardCheck()) return result;

        const guard = this.parseLeakageGuard(result);
        if (guard === null) return result;   // parse failure already recorded

        const context = this.buildValidationContext();
        const issues = validateLeakageGuard(guard, context);
        this.applyIssues(result, issues);

        return result;
    }

    /**
     * Whether the leakage guard needs re-checking on this save. It does on insert,
     * and whenever the guard or the source bindings it is validated against change.
     */
    private needsLeakageGuardCheck(): boolean {
        if (!this.IsSaved) return true;
        const guardDirty = this.GetFieldByName('LeakageGuard')?.Dirty ?? false;
        const bindingsDirty = this.GetFieldByName('SourceBindings')?.Dirty ?? false;
        const targetDirty = this.GetFieldByName('TargetEntityID')?.Dirty ?? false;
        return guardDirty || bindingsDirty || targetDirty;
    }

    /**
     * Parse the `LeakageGuard` JSON column. A null/blank guard is legitimate (no
     * deny-list configured) and yields an empty guard rather than an error;
     * malformed JSON is a hard failure, because a guard we cannot read is a guard
     * we cannot enforce.
     *
     * @returns the parsed guard, or `null` when a parse error was recorded on `result`
     */
    private parseLeakageGuard(result: ValidationResult): LeakageGuard | null {
        const raw = this.LeakageGuard;
        if (raw == null || raw.trim().length === 0) {
            return { DenyFields: [], SingleFeatureDominanceThreshold: DOMINANCE_THRESHOLD_DEFAULT };
        }

        try {
            const parsed = JSON.parse(raw) as Partial<LeakageGuard>;
            return {
                DenyFields: parsed.DenyFields ?? [],
                DenySources: parsed.DenySources,
                SingleFeatureDominanceThreshold:
                    parsed.SingleFeatureDominanceThreshold ?? DOMINANCE_THRESHOLD_DEFAULT,
            };
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            result.Errors.push(new ValidationErrorInfo(
                'LeakageGuard',
                `LeakageGuard is not valid JSON (${message}). A guard that cannot be read cannot be enforced, ` +
                `so the pipeline would train with no leakage protection at all.`,
                raw,
                ValidationErrorType.Failure
            ));
            result.Success = false;
            return null;
        }
    }

    /**
     * Collect the columns a deny entry could legitimately name, across the target
     * entity and every bound source.
     *
     * `ColumnsFullyResolved` is the important part. Only `Entity` sources expose an
     * enumerable column list; a Query, external entity, vector set, or upstream
     * feature pipeline does not. If any such source is bound we cannot prove a deny
     * entry matches nothing, so the semantic check must stand down — otherwise a
     * perfectly valid entry naming a column on that source would be wrongly rejected.
     * The structural check still runs either way, and that is what catches the
     * pasted-list bug.
     */
    private buildValidationContext(): LeakageGuardValidationContext {
        const bindings = this.parseSourceBindings();
        const provider = this.ProviderToUse as unknown as IMetadataProvider;

        const columns: string[] = [];
        let fullyResolved = true;

        const targetEntity = this.TargetEntityID ? provider?.EntityByID(this.TargetEntityID) : undefined;
        if (targetEntity) {
            columns.push(...this.columnsOf(targetEntity));
        } else if (this.TargetEntityID) {
            fullyResolved = false;   // target entity is set but unresolvable
        }

        for (const binding of bindings) {
            if (binding.Kind !== 'Entity') {
                fullyResolved = false;   // columns of non-entity sources aren't enumerable here
                continue;
            }
            const entity = provider?.EntityByName(binding.Ref);
            if (!entity) {
                fullyResolved = false;
                continue;
            }
            columns.push(...this.columnsOf(entity));
        }

        return {
            KnownColumns: columns,
            KnownSources: bindings.map((b) => b.Ref),
            ColumnsFullyResolved: fullyResolved,
        };
    }

    /** Field names of an entity, which are the column names a deny entry may name. */
    private columnsOf(entity: EntityInfo): string[] {
        return entity.Fields.map((f) => f.Name);
    }

    /** Parse the `SourceBindings` JSON column, tolerating null/blank/garbage. */
    private parseSourceBindings(): SourceBinding[] {
        const raw = this.SourceBindings;
        if (raw == null || raw.trim().length === 0) return [];
        try {
            const parsed = JSON.parse(raw) as SourceBinding[];
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            // A malformed SourceBindings column is not this validator's problem to
            // report, but it does mean we cannot enumerate columns — treat as none,
            // which makes the context not-fully-resolved and stands the semantic
            // check down rather than producing bogus "matches no column" errors.
            return [];
        }
    }

    /** Fold guard issues into the entity's ValidationResult. */
    private applyIssues(result: ValidationResult, issues: LeakageGuardIssue[]): void {
        for (const issue of issues) {
            const type = issue.Severity === 'Failure' ? ValidationErrorType.Failure : ValidationErrorType.Warning;
            result.Errors.push(new ValidationErrorInfo('LeakageGuard', issue.Message, issue.Value, type));
            if (issue.Severity === 'Failure') {
                result.Success = false;
            }
        }
    }
}

/**
 * Tree-shaking guard — dynamic ClassFactory instantiation is invisible to the
 * bundler, so this keeps the registration alive.
 */
export function LoadMJMLTrainingPipelineEntityServer(): void {
    // no-op
}
