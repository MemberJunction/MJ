import { BaseEntity, type EntitySaveOptions } from '@memberjunction/core';
import { MJRubricEvaluationEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { LoadDraftForPublish } from './rubrics/versionPublish.js';
import { AssertCanSupersede, SubmitEvaluation, type PersistedEvaluation, type PersistedScore, type SubmitEvaluationInput } from './rubrics/evaluationSubmit.js';

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
     * Draft. A supersede target is refused when the subject, context, rubric,
     * or status does not match, and otherwise saved as Superseded in this same
     * save. SubmittedAt is set with the status.
     */
    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        const status = this.GetFieldByName('Status');
        if (status?.Dirty && status.OldValue === 'Draft' && this.Status === 'Submitted') {
            const provider = this.ProviderToUse as { RunView?: (params: { EntityName: string; ExtraFilter: string; ResultType?: 'simple' | 'entity_object' }, user?: unknown) => Promise<{ Success: boolean; Results?: unknown[] }> };
            if (!provider?.RunView) throw new Error('Submitting an evaluation requires a provider that can load the version and scores.');
            const run = (entityName: string, filter: string) => provider.RunView!({ EntityName: entityName, ExtraFilter: filter, ResultType: 'entity_object' }, this.ContextCurrentUser);
            const versionRows = await run('MJ: Rubric Versions', `ID='${this.RubricVersionID}'`);
            const versionRow = versionRows.Results?.[0] as { Status?: string; RubricID?: string } | undefined;
            if (!versionRow) throw new Error('The pinned rubric version was not found.');
            const loaded = await LoadDraftForPublish(run, this.RubricVersionID, String(versionRow.RubricID ?? this.RubricID), null);
            const scoreRows = await run('MJ: Rubric Evaluation Scores', `EvaluationID='${this.ID}'`);
            const input: SubmitEvaluationInput = {
                version: loaded.draft,
                versionStatus: versionRow.Status as SubmitEvaluationInput['versionStatus'],
                supersedesEvaluationId: this.SupersedesEvaluationID,
                scores: (scoreRows.Results ?? []).map(row => readScore(row)),
                passThresholdOverride: this.PassThresholdApplied == null ? null : Number(this.PassThresholdApplied),
            };
            const prior = this.SupersedesEvaluationID ? await loadPrior(run, this.SupersedesEvaluationID) : null;
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
            for (const row of scoreRows.Results ?? []) {
                const record = row as Record<string, unknown> & { Save?: () => Promise<boolean>; Get?: (name: string) => unknown };
                const criterionId = String(record.CriterionID ?? record.Get?.('CriterionID'));
                const computed = result.scores.find(score => score.criterionId === criterionId);
                if (!computed || !record.Save) continue;
                record.NormalizedScore = computed.normalizedScore;
                record.EffectiveWeight = computed.effectiveWeight;
                record.OverallContribution = computed.overallContribution;
                record.GateFailed = computed.gateFailed;
                record.IsComputed = computed.isComputed;
                if (computed.isComputed) record.allowServerComputedWrite = true;
                writtenIds.add(criterionId);
                await record.Save();
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
                if (created.Save) await created.Save();
            }
            if (prior) {
                prior.row.Status = 'Superseded';
                await prior.row.Save();
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
        }
        return super.Save(options);
    }
}

async function loadPrior(run: (entityName: string, filter: string) => Promise<{ Success: boolean; Results?: unknown[] }>, id: string): Promise<{ target: { status: string; subjectEntityId: string; subjectRecordId: string; contextEntityId: string | null; contextRecordId: string | null; rubricId: string }; row: { Status?: string; Save: () => Promise<boolean> } }> {
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
