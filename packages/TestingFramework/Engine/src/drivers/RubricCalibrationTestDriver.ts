import { RegisterClass } from '@memberjunction/global';
import { RunView } from '@memberjunction/core';
import { providerRubricEngine } from '@memberjunction/rubrics';
import { BaseTestDriver } from './BaseTestDriver';
import { CalibrationOracles, CalibrationPairs, type CalibrationExpectation, type CalibrationPair } from './calibration';
import type { DriverExecutionContext, DriverExecutionResult } from '../types';

interface CalibrationInput {
    rubricId: string;
    goldSet: { subjectEntity: string; filter?: string } | { subjects: { entity: string; recordID: string }[] };
    evaluator?: { type?: string };
}

/** The link's evaluator. A missing name stays LLM. Agent runs through the engine's AI evaluator. */
function CalibrationEvaluator(type: string | undefined): 'AI' | 'Deterministic' | 'LLM' {
    if (type === 'Deterministic') return 'Deterministic';
    if (type === 'Agent' || type === 'AI') return 'AI';
    return 'LLM';
}

/**
 * Scores a gold set with the AI evaluator and checks agreement with the submitted human scores
 * on the same rubric major. The test score is the overall quadratic-weighted kappa, clamped to 0..1.
 */
@RegisterClass(BaseTestDriver, 'RubricCalibrationTestDriver')
export class RubricCalibrationTestDriver extends BaseTestDriver {
    public async Execute(context: DriverExecutionContext): Promise<DriverExecutionResult> {
        const input = this.parseInputDefinition<CalibrationInput>(context.test);
        const expected = this.parseExpectedOutcomes<CalibrationExpectation>(context.test) ?? {};
        const pairs = await this.loadPairs(input, context);
        const judged = CalibrationOracles(pairs, expected);
        const passedChecks = judged.oracles.filter(oracle => oracle.passed).length;
        return {
            targetType: 'Rubric',
            targetLogId: input.rubricId,
            status: this.determineStatus(judged.oracles),
            score: judged.score,
            oracleResults: judged.oracles,
            passedChecks,
            failedChecks: judged.oracles.length - passedChecks,
            totalChecks: judged.oracles.length,
            inputData: input,
            expectedOutput: expected,
            actualOutput: { sampleSize: pairs.length },
            totalCost: 0,
            durationMs: 0,
        };
    }

    /** Human and AI scores for the gold subjects, paired on the same major and criterion. */
    protected async loadPairs(input: CalibrationInput, context: DriverExecutionContext): Promise<CalibrationPair[]> {
        const subjects = await this.goldSubjects(input, context);
        if (subjects.length === 0 || !input.rubricId) return [];
        const view = new RunView();
        const user = context.contextUser;
        const rubricId = input.rubricId.replace(/'/g, "''");
        const subjectIds = subjects.map(subject => `'${subject.recordID.replace(/'/g, "''")}'`).join(', ');
        const evaluations = await view.RunView({
            EntityName: 'MJ: Rubric Evaluations',
            ExtraFilter: `RubricID='${rubricId}' AND Status='Submitted' AND SubjectRecordID IN (${subjectIds})`,
            ResultType: 'simple',
            MaxRows: 1000,
        }, user);
        const evaluationRows = (evaluations.Results ?? []) as Record<string, unknown>[];
        const versions = await view.RunView({
            EntityName: 'MJ: Rubric Versions',
            ExtraFilter: `RubricID='${rubricId}'`,
            ResultType: 'simple',
            MaxRows: 200,
        }, user);
        const versionRows = (versions.Results ?? []) as Record<string, unknown>[];
        const majorByVersion = new Map(versionRows.map(row => [String(row.ID), Number(row.MajorVersion ?? 0)]));
        const human = evaluationRows.filter(row => String(row.EvaluatorType) === 'Human');
        const needed = new Map<string, number>();
        for (const row of human) {
            const major = majorByVersion.get(String(row.RubricVersionID)) ?? 0;
            const subject = String(row.SubjectRecordID);
            if (!needed.has(subject)) needed.set(subject, major);
        }
        const freshIds = new Set<string>();
        for (const [subjectId, major] of needed) {
            const created = await this.scoreSubject(input, subjectId, subjects.find(subject => subject.recordID === subjectId)?.entity ?? '', versionRows, major, context);
            if (created) freshIds.add(created);
        }
        const refreshed = ((await view.RunView({
            EntityName: 'MJ: Rubric Evaluations',
            ExtraFilter: `RubricID='${rubricId}' AND Status='Submitted' AND SubjectRecordID IN (${subjectIds})`,
            ResultType: 'simple',
            MaxRows: 1000,
        }, user)).Results ?? []) as Record<string, unknown>[];
        const scoped = refreshed.filter(row => String(row.EvaluatorType) === 'Human' || freshIds.has(String(row.ID)));
        return this.pairsFrom(scoped, versionRows, view, user);
    }

    private async goldSubjects(input: CalibrationInput, context: DriverExecutionContext): Promise<{ entity: string; recordID: string }[]> {
        if ('subjects' in input.goldSet) return input.goldSet.subjects ?? [];
        const view = new RunView();
        const result = await view.RunView({
            EntityName: input.goldSet.subjectEntity,
            ExtraFilter: input.goldSet.filter || undefined,
            ResultType: 'simple',
            MaxRows: 200,
        }, context.contextUser);
        return ((result.Results ?? []) as Record<string, unknown>[]).map(row => ({
            entity: input.goldSet && 'subjectEntity' in input.goldSet ? input.goldSet.subjectEntity : '',
            recordID: String(row.ID ?? ''),
        })).filter(subject => subject.recordID.length > 0);
    }

    /** Runs the named evaluator for one gold subject, in this test's context. A subclass can replace this in a test. */
    protected async scoreSubject(
        input: CalibrationInput,
        subjectId: string,
        entityName: string,
        versions: Record<string, unknown>[],
        major: number,
        context: DriverExecutionContext,
    ): Promise<string | undefined> {
        const published = versions
            .filter(row => Number(row.MajorVersion ?? 0) === major && String(row.Status) === 'Published')
            .sort((left, right) => Number(right.MinorVersion ?? 0) - Number(left.MinorVersion ?? 0) || Number(right.PatchVersion ?? 0) - Number(left.PatchVersion ?? 0))[0];
        const engine = providerRubricEngine(this.Provider as never, context.contextUser);
        const result = await engine.evaluateRecord({
            rubricId: input.rubricId,
            versionId: published ? String(published.ID) : undefined,
            subjectEntityName: entityName,
            subjectRecordId: subjectId,
            contextEntityName: 'MJ: Tests',
            contextRecordId: context.test.ID,
            evaluator: CalibrationEvaluator(input.evaluator?.type),
        });
        return result.evaluationId;
    }

    private async pairsFrom(evaluations: Record<string, unknown>[], versions: Record<string, unknown>[], view: RunView, user: DriverExecutionContext['contextUser']): Promise<CalibrationPair[]> {
        const majorByVersion = new Map(versions.map(row => [String(row.ID), Number(row.MajorVersion ?? 0)]));
        const ids = evaluations.map(row => `'${String(row.ID).replace(/'/g, "''")}'`);
        if (ids.length === 0) return [];
        const scores = await view.RunView({
            EntityName: 'MJ: Rubric Evaluation Scores',
            ExtraFilter: `EvaluationID IN (${ids.join(', ')}) AND NormalizedScore IS NOT NULL`,
            ResultType: 'simple',
            MaxRows: 2000,
        }, user);
        const scoreRows = (scores.Results ?? []) as Record<string, unknown>[];
        const levelIds = [...new Set(scoreRows.map(row => row.ScaleLevelID).filter(id => id != null).map(id => String(id)))];
        const usedLevels = levelIds.length === 0 ? [] : ((await view.RunView({
            EntityName: 'MJ: Rubric Scale Levels',
            ExtraFilter: `ID IN (${levelIds.map(id => `'${id.replace(/'/g, "''")}'`).join(', ')})`,
            ResultType: 'simple',
            MaxRows: 500,
        }, user)).Results ?? []) as Record<string, unknown>[];
        const scaleIds = [...new Set(usedLevels.map(row => String(row.ScaleID ?? '')).filter(id => id.length > 0))];
        const scaleLevels = scaleIds.length === 0 ? usedLevels : ((await view.RunView({
            EntityName: 'MJ: Rubric Scale Levels',
            ExtraFilter: `ScaleID IN (${scaleIds.map(id => `'${id.replace(/'/g, "''")}'`).join(', ')})`,
            ResultType: 'simple',
            MaxRows: 500,
        }, user)).Results ?? []) as Record<string, unknown>[];
        const criterionIds = [...new Set(scoreRows.map(row => String(row.CriterionID ?? '')).filter(id => id.length > 0))];
        const criteria = criterionIds.length === 0 ? [] : ((await view.RunView({
            EntityName: 'MJ: Rubric Criteria',
            ExtraFilter: `ID IN (${criterionIds.map(id => `'${id.replace(/'/g, "''")}'`).join(', ')})`,
            ResultType: 'simple',
            MaxRows: 500,
        }, user)).Results ?? []) as Record<string, unknown>[];
        return CalibrationPairs({
            evaluations: evaluations.map(row => ({
                id: String(row.ID),
                subjectId: String(row.SubjectRecordID ?? ''),
                versionId: String(row.RubricVersionID ?? ''),
                evaluatorType: String(row.EvaluatorType ?? ''),
                status: String(row.Status ?? ''),
            })),
            versions: versions.map(row => ({ id: String(row.ID), major: majorByVersion.get(String(row.ID)) ?? 0 })),
            scores: scoreRows.map(row => ({
                evaluationId: String(row.EvaluationID ?? ''),
                criterionId: String(row.CriterionID ?? ''),
                normalizedScore: row.NormalizedScore == null ? null : Number(row.NormalizedScore),
                scaleLevelId: row.ScaleLevelID == null ? null : String(row.ScaleLevelID),
            })),
            levels: scaleLevels.map(row => ({ id: String(row.ID), scaleId: String(row.ScaleID ?? ''), sequence: Number(row.Sequence ?? 0) })),
            criteria: criteria.map(row => ({ id: String(row.ID), key: String(row.Key ?? '') })),
        });
    }
}
