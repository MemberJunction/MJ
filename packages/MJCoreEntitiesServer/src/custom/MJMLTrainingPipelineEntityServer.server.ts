import { BaseEntity, EntityInfo, IEntityDataProvider, IMetadataProvider, RunView, ValidationErrorInfo, ValidationErrorType, ValidationResult } from '@memberjunction/core';
import { EscapeSQLString, RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { MJMLTrainingPipelineEntity } from '@memberjunction/core-entities';
import type { MJEvaluationProtocolEntity, MJPredictionUnitEntity } from '@memberjunction/core-entities';
import { VersionedRowGuard } from './MJPredictionUnitEntityServer.server';
import {
    JsonParse,
    PredictionUnit,
    TaskTypeRules,
    validateLeakageGuard,
    DOMINANCE_THRESHOLD_DEFAULT,
    type LeakageGuard,
    type LeakageGuardIssue,
    type LeakageGuardValidationContext,
    type SourceBinding,
} from '@memberjunction/predictive-studio-core';

/** What the pipeline check needs to know about its unit (resolved by ValidateAsync). */
export interface PipelineUnitFacts { readonly TaskType: string; readonly RowEntityID: string; readonly DescribedLabel: string }

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

        await this.runLeakageGuardCheck(result);
        if (this.needsUnitProtocolCheck()) await this.checkUnitAndProtocol(result);
        return result;
    }

    /**
     * Fast-path: the guard can only become newly unsound when the guard itself,
     * or the sources its entries are checked against, are being changed.
     */
    private async runLeakageGuardCheck(result: ValidationResult): Promise<void> {
        if (!this.needsLeakageGuardCheck()) return;

        const guard = this.parseLeakageGuard(result);
        if (guard === null) return;   // parse failure already recorded

        const context = this.buildValidationContext();
        const issues = validateLeakageGuard(guard, context);
        this.applyIssues(result, issues);
    }

    /** Whether the unit and protocol agreement needs re-checking: on insert, or when any column it reads changes. */
    private needsUnitProtocolCheck(): boolean {
        if (!this.IsSaved) return true;
        return ['PredictionUnitID', 'EvaluationProtocolID', 'TargetEntityID', 'ProblemType', 'TargetVariable']
            .some((name) => this.GetFieldByName(name)?.Dirty ?? false);
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
        const dataProvider = this.ProviderToUse;
        const provider = VersionedRowGuard.IsMetadataProvider(dataProvider) ? dataProvider : undefined;

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

    /**
     * A pipeline that names a unit must agree with it (legacy TargetEntityID/ProblemType/TargetVariable are derived from
     * the unit), and a protocol it names must score the unit's task family. Pure.
     */
    public static GetPipelineUnitProtocolProblems(
        pipeline: Pick<MJMLTrainingPipelineEntity, 'TargetEntityID' | 'ProblemType' | 'TargetVariable'>,
        unit: PipelineUnitFacts,
        protocol: Pick<MJEvaluationProtocolEntity, 'PrimaryScore'> | null,
    ): string[] {
        const problems: string[] = [];
        const taskJson = JsonParse.ParseJsonText(unit.TaskType, 'TaskType');
        const task = taskJson.Ok === true ? TaskTypeRules.ParseTaskType(taskJson.Value) : null;
        const taskKind = task !== null && task.Ok === true ? task.Value.kind : null;
        if (!UUIDsEqual(pipeline.TargetEntityID, unit.RowEntityID)) {
            problems.push(`TargetEntityID must be the unit's row entity (${unit.RowEntityID}) when PredictionUnitID is set`);
        }
        // One derivation of the legacy value (TaskTypeRules), shared with every writer of ProblemType.
        const expectedProblemType = task !== null && task.Ok === true ? TaskTypeRules.LegacyProblemTypeForTask(task.Value) : 'regression';
        if (pipeline.ProblemType !== expectedProblemType) problems.push(`ProblemType must be ${expectedProblemType} for a ${taskKind || 'unknown'} unit`);
        if (pipeline.TargetVariable !== unit.DescribedLabel) problems.push(`TargetVariable must read "${unit.DescribedLabel}" (the unit's outcome rule)`);
        if (protocol) {
            const primary = JsonParse.ParseJsonText(protocol.PrimaryScore, 'PrimaryScore');
            const family = primary.Ok === true && JsonParse.IsJsonObject(primary.Value) ? JsonParse.JsonString(primary.Value, 'family') : null;
            if (family !== taskKind) {
                problems.push(`The Evaluation Protocol scores family "${family || 'unknown'}" but the Prediction Unit declares task "${taskKind || 'unknown'}"; ranking a ${taskKind || 'unknown'} model by a ${family || 'unknown'} score is refused`);
            }
        }
        return problems;
    }

    private async checkUnitAndProtocol(result: ValidationResult): Promise<void> {
        const unitID = this.PredictionUnitID;
        if (!unitID) return;
        const provider = this.ProviderToUse;
        if (!VersionedRowGuard.IsMetadataProvider(provider)) return;
        const { unitRow, protocol } = await this.loadUnitAndProtocol(provider, unitID, this.EvaluationProtocolID);
        if (!unitRow) {
            this.fail(result, 'PredictionUnitID', `Prediction Unit ${unitID} was not found`);
            return;
        }
        if (this.EvaluationProtocolID && !protocol) {
            this.fail(result, 'EvaluationProtocolID', `Evaluation Protocol ${this.EvaluationProtocolID} was not found`);
            return;
        }
        const spec = PredictionUnit.ParsePredictionUnitRow(unitRow);
        if (spec.Ok === false) {
            this.fail(result, 'PredictionUnitID', `Prediction Unit ${unitID} does not parse: ${spec.Errors.join('; ')}`);
            return;
        }
        const rowEntityName = PredictionUnit.UnitRowEntityName(spec.Value.rows);
        const facts: PipelineUnitFacts = {
            TaskType: unitRow.TaskType,
            RowEntityID: provider.EntityByName(rowEntityName)?.ID || `(unknown entity ${rowEntityName})`,
            DescribedLabel: PredictionUnit.DescribeLabelRule(spec.Value),
        };
        for (const problem of MJMLTrainingPipelineEntityServer.GetPipelineUnitProtocolProblems(this, facts, protocol)) {
            this.fail(result, 'PredictionUnitID', problem);
        }
    }

    /**
     * Reads the bound unit row (every column, for the parser) and the bound protocol's primary score, in parallel, as
     * plain rows (nothing is mutated). A failed read is reported as "not found" by the caller.
     */
    private async loadUnitAndProtocol(
        provider: IEntityDataProvider & IMetadataProvider,
        unitID: string,
        protocolID: string | null,
    ): Promise<{ unitRow: MJPredictionUnitEntity | null; protocol: Pick<MJEvaluationProtocolEntity, 'PrimaryScore'> | null }> {
        const rv = RunView.FromMetadataProvider(provider);
        const [units, protocols] = await Promise.all([
            rv.RunView<MJPredictionUnitEntity>(
                { EntityName: 'MJ: Prediction Units', ExtraFilter: `ID='${EscapeSQLString(unitID)}'`, ResultType: 'simple' },
                this.ContextCurrentUser,
            ),
            protocolID
                ? rv.RunView<Pick<MJEvaluationProtocolEntity, 'PrimaryScore'>>(
                    { EntityName: 'MJ: Evaluation Protocols', ExtraFilter: `ID='${EscapeSQLString(protocolID)}'`, Fields: ['PrimaryScore'], ResultType: 'simple' },
                    this.ContextCurrentUser,
                )
                : null,
        ]);
        return {
            unitRow: units.Success ? units.Results[0] || null : null,
            protocol: protocols !== null && protocols.Success ? protocols.Results[0] || null : null,
        };
    }

    private fail(result: ValidationResult, field: string, message: string): void {
        result.Success = false;
        result.Errors.push(new ValidationErrorInfo(field, message, null, ValidationErrorType.Failure));
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
