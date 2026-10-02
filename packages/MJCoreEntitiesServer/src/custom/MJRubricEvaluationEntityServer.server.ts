import { BaseEntity, RunInEntityTransaction, type EntitySaveOptions, type ValidationResult } from '@memberjunction/core';
import { IsValidUUID } from '@memberjunction/global';
import { MJRubricEvaluationEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { LoadDraftForPublish } from './rubrics/versionPublish.js';
import { AssertCanSupersede, AssertPinnedVersionForCreate, SubmitEvaluation, type PersistedEvaluation, type PersistedScore, type SubmitEvaluationInput } from './rubrics/evaluationSubmit.js';
import { EvaluationStatusError, PushFailure } from './rubrics/statusRules.js';

/**
 * Creates and submits an evaluation.
 *
 * Submit refuses a draft version, a retired version that is not the one being
 * superseded, a score for a criterion outside the version, a level from the
 * wrong scale, a raw value on a levels scale, a client-written computed row,
 * and a missing rationale or evidence when the criterion requires it.
 * It calls RubricScoring.compute and writes that result. It does not reimplement
 * the math. Score rows must be saved while this evaluation is still Draft,
 * because the score trigger rejects writes after submit.
 */
@RegisterClass(BaseEntity, 'MJ: Rubric Evaluations')
export class MJRubricEvaluationEntityServer extends MJRubricEvaluationEntity {
    /**
     * Scores the draft and copies the computed fields onto this evaluation,
     * including Status Submitted. Returns the score rows to persist first.
     */
    public Submit(input: SubmitEvaluationInput): { evaluation: PersistedEvaluation; scores: PersistedScore[] } {
        const result = SubmitEvaluation(input);
        const written = result.evaluation;
        this.NormalizedScore = written.normalizedScore;
        this.Completeness = written.completeness;
        this.Outcome = written.outcome;
        this.Passed = written.passed;
        this.GateFailed = written.gateFailed;
        this.PassThresholdApplied = written.passThresholdApplied;
        this.BandID = written.bandId;
        this.Confidence = written.confidence;
        this.ScoringEngineVersion = written.scoringEngineVersion;
        this.Status = 'Submitted';
        this.SubmittedAt = written.submittedAt;
        return result;
    }

    /** @deprecated Use {@link Submit}. */
    public submit(input: SubmitEvaluationInput): { evaluation: PersistedEvaluation; scores: PersistedScore[] } {
        return this.Submit(input);
    }

    /**
     * When Status moves Draft → Submitted, loads the pinned version and the
     * score rows and calls {@link submit}. Setting Status and saving is enough.
     * Score rows are written before this row, while the stored status is still
     * Draft. This evaluation is saved next. A supersede target is refused when
     * the subject, context, rubric, or status does not match, and is marked
     * Superseded only after this evaluation saves. A false Save throws, so a
     * failed save does not leave the prior row Superseded. SubmittedAt is set
     * with the status. The three writes share one entity transaction.
     */
    /**
     * A new evaluation is Draft. Draft may be submitted or fail. Submitted may
     * be superseded or withdrawn. Every other move is refused.
     */
    public override async ValidateAsync(): Promise<ValidationResult> {
        const result = await super.ValidateAsync();
        const status = this.GetFieldByName('Status');
        const previous = this.IsSaved === false ? null : String(status?.OldValue ?? this.Status);
        const message = EvaluationStatusError(this.IsSaved === false, previous, String(this.Status));
        if (message) PushFailure(result, 'Status', message, this.Status);
        return result;
    }

    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        if (this.IsSaved === false) {
            await this.assertNewPinPublished();
        }
        const status = this.GetFieldByName('Status');
        if (!(status?.Dirty && status.OldValue === 'Draft' && this.Status === 'Submitted')) {
            return super.Save(options);
        }
        return RunInEntityTransaction(this.ProviderToUse as Parameters<typeof RunInEntityTransaction>[0], async () => {
            const provider = this.ProviderToUse as { RunView?: (params: { EntityName: string; ExtraFilter: string; ResultType?: 'simple' | 'entity_object' }, user?: unknown) => Promise<{ Success: boolean; Results?: unknown[] }> };
            if (!provider?.RunView) throw new Error('Submitting an evaluation requires a provider that can load the version and scores.');
            const run = (entityName: string, filter: string) => provider.RunView!({ EntityName: entityName, ExtraFilter: filter, ResultType: 'entity_object' }, this.ContextCurrentUser);
            const versionId = requireId(this.RubricVersionID, 'rubric version');
            const evaluationId = requireId(this.ID, 'evaluation');
            const versionRows = await run('MJ: Rubric Versions', `ID='${versionId}'`);
            const versionRow = versionRows.Results?.[0] as { Status?: string; RubricID?: string } | undefined;
            if (!versionRows.Success || !versionRow) throw new Error('The pinned rubric version was not found.');
            const loaded = await LoadDraftForPublish(run, versionId, String(versionRow.RubricID ?? this.RubricID), null);
            const scoreRows = await run('MJ: Rubric Evaluation Scores', `EvaluationID='${evaluationId}'`);
            if (!scoreRows.Success) throw new Error('Could not read the scores.');
            const clientScores = (scoreRows.Results ?? []).filter(row => !readScore(row).isComputed);
            const prior = this.SupersedesEvaluationID ? await loadPrior(run, this.SupersedesEvaluationID) : null;
            const input: SubmitEvaluationInput = {
                version: loaded.draft,
                versionStatus: versionRow.Status as SubmitEvaluationInput['versionStatus'],
                supersedesEvaluationId: this.SupersedesEvaluationID ? requireId(this.SupersedesEvaluationID, 'prior evaluation') : null,
                priorVersionId: prior?.versionId ?? null,
                scores: clientScores.map(row => readScore(row)),
                passThresholdOverride: this.PassThresholdApplied == null ? null : Number(this.PassThresholdApplied),
            };
            if (prior) {
                // RubricID on an evaluation is a view column. A record created in this
                // session has the pinned version, not that column, until it is reloaded.
                AssertCanSupersede(prior.target, {
                    status: 'Submitted',
                    subjectEntityId: this.SubjectEntityID,
                    subjectRecordId: this.SubjectRecordID,
                    contextEntityId: this.ContextEntityID,
                    contextRecordId: this.ContextRecordID,
                    rubricId: String(versionRow.RubricID ?? this.RubricID ?? ''),
                });
            }
            const result = SubmitEvaluation(input);
            const writtenIds = new Set<string>();
            for (const row of clientScores) {
                const record = row as Record<string, unknown> & { Save?: () => Promise<boolean>; Get?: (name: string) => unknown };
                const criterionId = String(record.CriterionID ?? record.Get?.('CriterionID'));
                const computed = result.scores.find(score => score.criterionId === criterionId);
                if (!computed) continue;
                record.NormalizedScore = computed.normalizedScore;
                record.EffectiveWeight = computed.effectiveWeight;
                record.OverallContribution = computed.overallContribution;
                record.GateFailed = computed.gateFailed;
                record.IsComputed = computed.isComputed;
                if (computed.isComputed) record.allowServerComputedWrite = true;
                writtenIds.add(criterionId);
                await saveOrThrow(record, 'the score');
            }
            const providerWithCreate = provider as { GetEntityObject?: (name: string, user?: unknown) => Promise<Record<string, unknown> & { NewRecord?: () => void; Save?: () => Promise<boolean> }> };
            for (const computed of result.scores) {
                if (!computed.isComputed || writtenIds.has(computed.criterionId) || !providerWithCreate.GetEntityObject) continue;
                const created = await providerWithCreate.GetEntityObject('MJ: Rubric Evaluation Scores', this.ContextCurrentUser);
                created.NewRecord?.();
                created.EvaluationID = this.ID;
                created.CriterionID = computed.criterionId;
                created.NormalizedScore = computed.normalizedScore;
                created.EffectiveWeight = computed.effectiveWeight;
                created.OverallContribution = computed.overallContribution;
                created.GateFailed = computed.gateFailed;
                created.IsComputed = true;
                created.allowServerComputedWrite = true;
                await saveOrThrow(created, 'the computed score');
            }
            const written = result.evaluation;
            this.NormalizedScore = written.normalizedScore;
            this.Completeness = written.completeness;
            this.Outcome = written.outcome;
            this.Passed = written.passed;
            this.GateFailed = written.gateFailed;
            this.PassThresholdApplied = written.passThresholdApplied;
            this.BandID = written.bandId;
            this.Confidence = written.confidence;
            this.ScoringEngineVersion = written.scoringEngineVersion;
            this.Status = 'Submitted';
            this.SubmittedAt = written.submittedAt;
            if (!await super.Save(options)) throw new Error('Could not save the evaluation.');
            if (prior) {
                prior.row.Status = 'Superseded';
                await saveOrThrow(prior.row, 'the previous evaluation');
            }
            return true;
        });
    }

    /** A row that does not exist yet can pin only a Published version. */
    private async assertNewPinPublished(): Promise<void> {
        const provider = this.ProviderToUse as { RunView?: (params: { EntityName: string; ExtraFilter: string; ResultType?: 'simple' | 'entity_object' }, user?: unknown) => Promise<{ Success: boolean; Results?: unknown[] }> };
        if (!provider?.RunView) throw new Error('Creating an evaluation requires a provider that can load the pinned version.');
        const versionId = requireId(this.RubricVersionID, 'rubric version');
        const versionRows = await provider.RunView({ EntityName: 'MJ: Rubric Versions', ExtraFilter: `ID='${versionId}'`, ResultType: 'entity_object' }, this.ContextCurrentUser);
        const versionRow = versionRows.Results?.[0] as { Status?: string } | undefined;
        if (!versionRows.Success || !versionRow) throw new Error('The pinned rubric version was not found.');
        AssertPinnedVersionForCreate(String(versionRow.Status ?? ''));
    }
}

async function saveOrThrow(record: { Save?: () => Promise<boolean> }, label: string): Promise<void> {
    if (!record.Save || !await record.Save()) throw new Error(`Could not save ${label}.`);
}

async function loadPrior(run: (entityName: string, filter: string) => Promise<{ Success: boolean; Results?: unknown[] }>, id: string): Promise<{ versionId: string | null; target: { status: string; subjectEntityId: string; subjectRecordId: string; contextEntityId: string | null; contextRecordId: string | null; rubricId: string }; row: { Status?: string; Save: () => Promise<boolean> } }> {
    const priorRows = await run('MJ: Rubric Evaluations', `ID='${id}'`);
    const prior = priorRows.Results?.[0] as { Status?: string; SubjectEntityID?: string; SubjectRecordID?: string; ContextEntityID?: string | null; ContextRecordID?: string | null; RubricID?: string; RubricVersionID?: string; Save?: () => Promise<boolean> } | undefined;
    if (!prior?.Save) throw new Error('The evaluation being superseded was not found.');
    let rubricId = prior.RubricID ? String(prior.RubricID) : '';
    if (!rubricId && prior.RubricVersionID) {
        const versionRows = await run('MJ: Rubric Versions', `ID='${prior.RubricVersionID}'`);
        const version = versionRows.Results?.[0] as { RubricID?: string } | undefined;
        rubricId = version?.RubricID ? String(version.RubricID) : '';
    }
    return {
        versionId: prior.RubricVersionID ? String(prior.RubricVersionID) : null,
        target: {
            status: String(prior.Status),
            subjectEntityId: String(prior.SubjectEntityID),
            subjectRecordId: String(prior.SubjectRecordID),
            contextEntityId: prior.ContextEntityID ?? null,
            contextRecordId: prior.ContextRecordID ?? null,
            rubricId,
        },
        row: prior as { Status?: string; Save: () => Promise<boolean> },
    };
}

function requireId(value: string | null | undefined, label: string): string {
    if (!value || !IsValidUUID(value)) throw new Error(`The ${label} id is not valid.`);
    return value;
}

function readScore(row: unknown): SubmitEvaluationInput['scores'][number] {
    const record = row as Record<string, unknown> & { Get?: (name: string) => unknown };
    const value = (name: string) => record[name] !== undefined ? record[name] : record.Get?.(name);
    return {
        criterionId: String(value('CriterionID')),
        scaleLevelId: value('ScaleLevelID') as string | null,
        rawValue: value('RawValue') as number | null,
        isNotApplicable: Boolean(value('IsNotApplicable')),
        confidence: value('Confidence') as number | null,
        rationale: value('Rationale') as string | null,
        evidence: value('Evidence'),
        isComputed: Boolean(value('IsComputed')),
    };
}
