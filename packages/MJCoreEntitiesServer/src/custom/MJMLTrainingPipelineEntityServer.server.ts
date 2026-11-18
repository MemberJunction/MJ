import { BaseEntity, EntityInfo, IEntityDataProvider, IMetadataProvider, LogStatus, UserInfo, ValidationErrorInfo, ValidationErrorType, ValidationResult } from '@memberjunction/core';
import { EscapeSQLString, IsValidUUID, RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { MJMLTrainingPipelineEntity } from '@memberjunction/core-entities';
import { VersionedRowGuard, type RowRead } from './MJMLPredictionUnitEntityServer.server';
import {
    EvaluationProtocol,
    EvaluationProtocolRules,
    JsonParse,
    PredictionUnit,
    TaskTypeRules,
    validateLeakageGuard,
    DOMINANCE_THRESHOLD_DEFAULT,
    type Actor,
    type GuardFieldsEditableBy,
    type LeakageGuard,
    type LeakageGuardIssue,
    type LeakageGuardValidationContext,
    type EvaluationProtocolColumns,
    type PredictionUnitColumns,
    type PredictionUnitSpec,
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
 *
 * It also checks the bound Prediction Unit and Evaluation Protocol (each bound ID is a well-formed ID of a row that
 * exists and parses; the unit's rules apply only when a unit is bound) and holds a protocol rebind to the guard-field
 * rule ({@link GetProtocolRebindProblem}). The reads run as the user the save is attributed to; see
 * {@link VersionedRowGuard} for why that is `ActiveUser`.
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
        if (this.needsUnitProtocolCheck()) await this.checkBindings(result);
        return result;
    }

    /**
     * The bound unit and protocol checks, then the rebind check against the protocol they read (a rebind changes
     * `EvaluationProtocolID`, so it always comes with these checks, and the new protocol is read once).
     */
    private async checkBindings(result: ValidationResult): Promise<void> {
        if (!this.PredictionUnitID && !this.EvaluationProtocolID) return;
        const provider = this.ProviderToUse;
        if (!VersionedRowGuard.IsMetadataProvider(provider)) {
            LogStatus(`MJMLTrainingPipelineEntityServer: the provider is not a metadata provider, so the Prediction Unit, Evaluation Protocol and protocol rebind checks were skipped for pipeline "${this.Name}"`);
            return;
        }
        const boundProtocol = await this.checkUnitAndProtocol(result, provider);
        if (boundProtocol !== null) await this.checkProtocolRebind(result, provider, boundProtocol);
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

    /** Whether the unit and protocol (and a protocol rebind) need re-checking: on insert, or when any column they read changes. */
    private needsUnitProtocolCheck(): boolean {
        if (!this.IsSaved) return true;
        return ['PredictionUnitID', 'EvaluationProtocolID', 'TargetEntityID', 'ProblemType', 'TargetVariable']
            .some((name) => this.GetFieldByName(name)?.Dirty === true);
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
        if ((raw === null || raw === undefined) || raw.trim().length === 0) {
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
        if ((raw === null || raw === undefined) || raw.trim().length === 0) return [];
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
     * A pipeline that names a unit must agree with it: the legacy TargetEntityID/ProblemType/TargetVariable are derived
     * from the unit. Pure.
     */
    public static GetPipelineUnitProblems(
        pipeline: Pick<MJMLTrainingPipelineEntity, 'TargetEntityID' | 'ProblemType' | 'TargetVariable'>,
        unit: PipelineUnitFacts,
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
        return problems;
    }

    /**
     * Why the bound protocol cannot be used with the unit: the protocol rules that need a unit (the primary score's
     * family is the unit's task, the holdout kind fits the unit, lags and windows and blocked-time gaps cover the
     * horizon, grouping keys are the unit's, a grouped unit's inner folds group (`inner-validation-ungrouped`), a grouped
     * non-forecast unit's intervals are cluster-bootstrap (`intervals-not-clustered`), and what a forecast can be
     * evaluated with), each as its sentence; or why
     * the protocol row does not parse. Empty when the protocol fits. Pure.
     */
    public static GetProtocolUnitProblems(protocol: EvaluationProtocolColumns, unit: PredictionUnitSpec): string[] {
        const parsed = EvaluationProtocol.ParseEvaluationProtocolRow(protocol);
        if (parsed.Ok === false) return [MJMLTrainingPipelineEntityServer.unparseableProtocol(protocol, parsed.Errors)];
        return EvaluationProtocolRules.ValidateProtocolForUnit(parsed.Value, unit).map((r) => EvaluationProtocolRules.DescribeProtocolRefusal(r));
    }

    /** The refusal for a protocol row that does not parse. */
    private static unparseableProtocol(protocol: EvaluationProtocolColumns, errors: readonly string[]): string {
        return `Evaluation Protocol ${protocol.ID} does not parse: ${errors.join('; ')}`;
    }

    /**
     * The bound unit and protocol: each bound ID must be a well-formed ID of a row that is read and exists, and a bound
     * protocol must parse, with or without a unit. With a unit, the unit must parse, the legacy columns must agree with
     * it and the protocol must fit it. Returns the bound protocol row when it was read and parses (the rebind check
     * compares it), else null; every refusal is recorded on `result`.
     */
    private async checkUnitAndProtocol(result: ValidationResult, provider: IEntityDataProvider & IMetadataProvider): Promise<EvaluationProtocolColumns | null> {
        const unitID = this.PredictionUnitID;
        const protocolID = this.EvaluationProtocolID;
        if (!this.boundIDsWellFormed(result, unitID, protocolID)) return null;
        const { Unit: unitRead, Protocol: protocolRead } = await this.loadUnitAndProtocol(provider, unitID, protocolID);
        const unitRow = unitRead === null ? null : this.readRowOrFail(result, 'PredictionUnitID', `Prediction Unit ${unitID}`, unitRead);
        if (unitRead !== null && !unitRow) return null;
        const protocol = protocolRead === null ? null : this.readRowOrFail(result, 'EvaluationProtocolID', `Evaluation Protocol ${protocolID}`, protocolRead);
        if (protocolRead !== null && !protocol) return null;
        const unit = unitRow === null ? null : this.checkUnitRow(result, provider, unitRow);
        if (protocol === null || !this.protocolParses(result, protocol)) return null;
        if (unit !== null) {
            for (const problem of MJMLTrainingPipelineEntityServer.GetProtocolUnitProblems(protocol, unit)) {
                VersionedRowGuard.Fail(result, 'EvaluationProtocolID', problem);
            }
        }
        return protocol;
    }

    /**
     * Whether every bound ID is a well-formed ID; each malformed one is recorded. Checked before reading, so a malformed
     * ID is refused in words rather than surfacing as the database's conversion error.
     */
    private boundIDsWellFormed(result: ValidationResult, unitID: string | null, protocolID: string | null): boolean {
        const bound: readonly (readonly [string, string | null])[] = [['PredictionUnitID', unitID], ['EvaluationProtocolID', protocolID]];
        const malformed = bound.filter(([, id]) => !!id && !IsValidUUID(id));
        for (const [field, id] of malformed) VersionedRowGuard.Fail(result, field, `${field} "${id}" is not a valid ID`);
        return malformed.length === 0;
    }

    /** The bound unit's parsed form, with the legacy columns' disagreements recorded; null (recorded) when it does not parse. */
    private checkUnitRow(result: ValidationResult, provider: IMetadataProvider, unitRow: PredictionUnitColumns): PredictionUnitSpec | null {
        const spec = PredictionUnit.ParsePredictionUnitRow(unitRow);
        if (spec.Ok === false) {
            VersionedRowGuard.Fail(result, 'PredictionUnitID', `Prediction Unit ${this.PredictionUnitID} does not parse: ${spec.Errors.join('; ')}`);
            return null;
        }
        const rowEntityName = PredictionUnit.UnitRowEntityName(spec.Value.rows);
        const facts: PipelineUnitFacts = {
            TaskType: unitRow.TaskType,
            RowEntityID: provider.EntityByName(rowEntityName)?.ID || `(unknown entity ${rowEntityName})`,
            DescribedLabel: PredictionUnit.DescribeLabelRule(spec.Value),
        };
        for (const problem of MJMLTrainingPipelineEntityServer.GetPipelineUnitProblems(this, facts)) {
            VersionedRowGuard.Fail(result, 'PredictionUnitID', problem);
        }
        return spec.Value;
    }

    /** Whether the bound protocol row parses; the refusal is recorded when it does not. */
    private protocolParses(result: ValidationResult, protocol: EvaluationProtocolColumns): boolean {
        const parsed = EvaluationProtocol.ParseEvaluationProtocolRow(protocol);
        if (parsed.Ok === false) VersionedRowGuard.Fail(result, 'EvaluationProtocolID', MJMLTrainingPipelineEntityServer.unparseableProtocol(protocol, parsed.Errors));
        return parsed.Ok === true;
    }

    /**
     * Reads the bound unit row and the bound protocol row (every column of each, for the parsers), in parallel, as
     * plain rows (nothing is mutated), each only when bound. A failed read carries its error, so it is never reported as
     * "not found".
     */
    private async loadUnitAndProtocol(
        provider: IEntityDataProvider & IMetadataProvider,
        unitID: string | null,
        protocolID: string | null,
    ): Promise<{ Unit: RowRead<PredictionUnitColumns> | null; Protocol: RowRead<EvaluationProtocolColumns> | null }> {
        const user = this.ActiveUser;
        const [unit, protocol] = await Promise.all([
            unitID
                ? VersionedRowGuard.ReadOneRow<PredictionUnitColumns>(provider, 'MJ: ML Prediction Units', `ID='${EscapeSQLString(unitID)}'`, user)
                : null,
            protocolID
                ? VersionedRowGuard.ReadOneRow<EvaluationProtocolColumns>(provider, 'MJ: ML Evaluation Protocols', `ID='${EscapeSQLString(protocolID)}'`, user)
                : null,
        ]);
        return { Unit: unit, Protocol: protocol };
    }

    /**
     * Moving a saved pipeline from one protocol to another changes the guard fields it trains under without saving a
     * version of the bound lineage, so the move is held to the guard-field rule ({@link GetProtocolRebindProblem}).
     * `to` is the new protocol as {@link checkUnitAndProtocol} read and parsed it; the previous one is read here.
     *
     * Two moves pass this check by construction (owner flag vvv): an agent acting through its human user's session
     * saves as that user, so it is indistinguishable from the user here; and an unbind to no protocol followed by a
     * bind is two saves, neither of which moves from one protocol to another.
     */
    private async checkProtocolRebind(result: ValidationResult, provider: IMetadataProvider, to: EvaluationProtocolColumns): Promise<void> {
        if (!this.IsSaved) return;
        const field = this.GetFieldByName('EvaluationProtocolID');
        const fromID: string | null = field?.Dirty === true ? field.OldValue : null;
        if (!fromID || UUIDsEqual(fromID, this.EvaluationProtocolID)) return;
        const user = this.ActiveUser;
        const fromRead = await VersionedRowGuard.ReadOneRow<EvaluationProtocolColumns>(provider, 'MJ: ML Evaluation Protocols', `ID='${EscapeSQLString(fromID)}'`, user);
        const from = this.readRowOrFail(result, 'EvaluationProtocolID', `Evaluation Protocol ${fromID}`, fromRead);
        if (!from) return;
        const problem = MJMLTrainingPipelineEntityServer.GetProtocolRebindProblem(from, to, MJMLTrainingPipelineEntityServer.RebindingActor(user));
        if (problem !== null) VersionedRowGuard.Fail(result, 'EvaluationProtocolID', problem);
    }

    /** The `system` component named for a rebind saved with no user. */
    private static readonly NO_USER_COMPONENT = 'ML Training Pipeline save with no user';

    /**
     * Who performs a rebind: the user the save is attributed to, as a `human` actor; with no user, a `system` actor. An
     * agent acting through its human user's session is that user here (owner flag vvv). Pure.
     */
    public static RebindingActor(user: Pick<UserInfo, 'ID'> | null | undefined): Actor {
        return user ? { kind: 'human', userId: user.ID } : { kind: 'system', component: MJMLTrainingPipelineEntityServer.NO_USER_COMPONENT };
    }

    /**
     * Why a pipeline may not move from protocol `from` to protocol `to`; null when it may. Pure.
     *
     * - A forward move within one lineage (`to.Version > from.Version`) is allowed: each later version's own save
     *   checked its guard-field change against the version before it.
     * - A backward move within one lineage (a downgrade) and any move to another lineage, when the guard fields differ
     *   ({@link EvaluationProtocolRules.ChangedGuardFields}), is allowed only when both `to`'s author and the rebinding
     *   actor may change guard fields under `from`'s `GuardFieldsEditableBy`
     *   ({@link EvaluationProtocolRules.MayEditGuardFields}). The author alone is not enough: it is who wrote `to`, not
     *   who is moving the pipeline onto it.
     * - Either row not parsing is a refusal.
     *
     * @param rebinder who performs the move ({@link RebindingActor})
     */
    public static GetProtocolRebindProblem(from: EvaluationProtocolColumns, to: EvaluationProtocolColumns, rebinder: Actor): string | null {
        const previous = EvaluationProtocol.ParseEvaluationProtocolRow(from);
        if (previous.Ok === false) return MJMLTrainingPipelineEntityServer.unparseableProtocol(from, previous.Errors);
        const next = EvaluationProtocol.ParseEvaluationProtocolRow(to);
        if (next.Ok === false) return MJMLTrainingPipelineEntityServer.unparseableProtocol(to, next.Errors);
        const sameLineage = UUIDsEqual(from.LineageRootID, to.LineageRootID);
        if (sameLineage && to.Version > from.Version) return null;
        const changed = EvaluationProtocolRules.ChangedGuardFields(previous.Value, next.Value);
        if (changed.length === 0) return null;
        const setting = previous.Value.guardFieldsEditableBy;
        const refused = [
            ...(EvaluationProtocolRules.MayEditGuardFields(next.Value.authoredBy, setting) ? [] : [`the target protocol's author (${next.Value.authoredBy.kind})`]),
            ...(EvaluationProtocolRules.MayEditGuardFields(rebinder, setting) ? [] : [`the rebinding actor (${MJMLTrainingPipelineEntityServer.describeActor(rebinder)})`]),
        ];
        if (refused.length === 0) return null;
        const move = sameLineage ? `a downgrade from version ${from.Version} to version ${to.Version} of the same lineage` : 'another lineage';
        return `Binding Evaluation Protocol ${to.ID} in place of ${from.ID} (${move}) changes the guard fields ${changed.join(', ')}, ` +
            `which ${from.ID}'s GuardFieldsEditableBy "${setting}" lets ${MJMLTrainingPipelineEntityServer.describeEditors(setting)} change; ` +
            `refused for ${refused.join(' and ')}.`;
    }

    /** Who may change guard fields under a setting, in words (the rule is {@link EvaluationProtocolRules.MayEditGuardFields}). */
    private static describeEditors(setting: GuardFieldsEditableBy): string {
        return setting === 'non-agent' ? 'any author but an agent tool call' : 'only a user';
    }

    /** An actor in a refusal: its kind, and the user or component it names. */
    private static describeActor(actor: Actor): string {
        switch (actor.kind) {
            case 'human': return `user ${actor.userId}`;
            case 'system': return `system: ${actor.component}`;
            case 'agent': return `agent run ${actor.agentRunId}`;
            case 'scheduled-job': return `scheduled job run ${actor.scheduledJobRunId}`;
        }
    }

    /** The row a read returned; null with "Reading … failed" or "… was not found" recorded on `field`. */
    private readRowOrFail<TRow>(result: ValidationResult, field: string, what: string, read: RowRead<TRow>): TRow | null {
        if (read.Error !== null) {
            VersionedRowGuard.Fail(result, field, `Reading ${what} failed: ${read.Error}`);
            return null;
        }
        if (!read.Row) VersionedRowGuard.Fail(result, field, `${what} was not found`);
        return read.Row;
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
