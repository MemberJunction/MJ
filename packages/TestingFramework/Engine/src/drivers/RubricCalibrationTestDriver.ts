import { RegisterClass } from '@memberjunction/global';
import { RunView } from '@memberjunction/core';
import { providerRubricEngine } from '@memberjunction/rubrics';
import { BaseTestDriver } from './BaseTestDriver';
import { calibrationOracles, type CalibrationExpectation, type CalibrationPair } from './calibration';
import type { DriverExecutionContext, DriverExecutionResult } from '../types';

interface CalibrationInput {
    rubricId: string;
    goldSet: { subjectEntity: string; filter?: string } | { subjects: { entity: string; recordID: string }[] };
    evaluator?: { type?: string };
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
        const judged = calibrationOracles(pairs, expected);
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
        let scored = false;
        for (const [subjectId, major] of needed) {
            const already = evaluationRows.some(row => String(row.SubjectRecordID) === subjectId && (String(row.EvaluatorType) === 'AIPrompt' || String(row.EvaluatorType) === 'Agent') && (majorByVersion.get(String(row.RubricVersionID)) ?? 0) === major);
            if (already) continue;
            await this.scoreSubject(input, subjectId, subjects.find(subject => subject.recordID === subjectId)?.entity ?? '', versionRows, major, context);
            scored = true;
        }
        const refreshed = scored
            ? ((await view.RunView({
                EntityName: 'MJ: Rubric Evaluations',
                ExtraFilter: `RubricID='${rubricId}' AND Status='Submitted' AND SubjectRecordID IN (${subjectIds})`,
                ResultType: 'simple',
                MaxRows: 1000,
            }, user)).Results ?? []) as Record<string, unknown>[]
            : evaluationRows;
        return this.pairsFrom(refreshed, versionRows, view, user);
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

    /** Runs the AI evaluator for one gold subject. A subclass can replace this in a test. */
    protected async scoreSubject(
        input: CalibrationInput,
        subjectId: string,
        entityName: string,
        versions: Record<string, unknown>[],
        major: number,
        context: DriverExecutionContext,
    ): Promise<void> {
        const published = versions
            .filter(row => Number(row.MajorVersion ?? 0) === major && String(row.Status) === 'Published')
            .sort((left, right) => Number(right.MinorVersion ?? 0) - Number(left.MinorVersion ?? 0) || Number(right.PatchVersion ?? 0) - Number(left.PatchVersion ?? 0))[0];
        const engine = providerRubricEngine(this.Provider as never, context.contextUser);
        await engine.evaluateRecord({
            rubricId: input.rubricId,
            versionId: published ? String(published.ID) : undefined,
            subjectEntityName: entityName,
            subjectRecordId: subjectId,
            contextEntityName: 'MJ: Tests',
            contextRecordId: context.test.ID,
            evaluator: 'LLM',
        });
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
        const byCriterion = new Map<string, { human?: { level: number; score: number; categories: number }; ai?: { level: number; score: number; categories: number }; major: number }>();
        const levelIds = [...new Set(((scores.Results ?? []) as Record<string, unknown>[]).map(row => row.ScaleLevelID).filter(id => id != null).map(id => String(id)))];
        const levels = levelIds.length === 0 ? [] : ((await view.RunView({
            EntityName: 'MJ: Rubric Scale Levels',
            ExtraFilter: `ID IN (${levelIds.map(id => `'${id.replace(/'/g, "''")}'`).join(', ')})`,
            ResultType: 'simple',
            MaxRows: 500,
        }, user)).Results ?? []) as Record<string, unknown>[];
        const levelIndex = new Map(levels.map(row => [String(row.ID), Number(row.Sequence ?? 0)]));
        const counts = new Map<string, number>();
        for (const level of levels) {
            const scale = String(level.ScaleID);
            counts.set(scale, (counts.get(scale) ?? 0) + 1);
        }
        for (const score of (scores.Results ?? []) as Record<string, unknown>[]) {
            const evaluation = evaluations.find(row => String(row.ID) === String(score.EvaluationID));
            if (!evaluation || String(evaluation.Status) !== 'Submitted') continue;
            const side = String(evaluation.EvaluatorType) === 'Human' ? 'human' : (String(evaluation.EvaluatorType) === 'AIPrompt' || String(evaluation.EvaluatorType) === 'Agent') ? 'ai' : null;
            if (!side) continue;
            const major = majorByVersion.get(String(evaluation.RubricVersionID)) ?? 0;
            const criterionId = String(score.CriterionID ?? '');
            if (!criterionId) continue;
            const key = `${evaluation.SubjectRecordID}|${major}|${criterionId}`;
            const bucket = byCriterion.get(key) ?? { major };
            const level = score.ScaleLevelID == null ? (Number(score.NormalizedScore) >= 0.5 ? 1 : 0) : (levelIndex.get(String(score.ScaleLevelID)) ?? 0);
            const categories = score.ScaleLevelID == null ? 2 : Math.max(2, counts.get(String(levels.find(row => String(row.ID) === String(score.ScaleLevelID))?.ScaleID ?? '')) ?? 2);
            bucket[side] = { level, score: Number(score.NormalizedScore), categories };
            byCriterion.set(key, bucket);
        }
        const pairs: CalibrationPair[] = [];
        for (const [key, bucket] of byCriterion) {
            if (!bucket.human || !bucket.ai) continue;
            const [subjectId, , criterionId] = key.split('|');
            pairs.push({
                subjectId,
                criterionId,
                humanLevel: bucket.human.level,
                aiLevel: bucket.ai.level,
                categoryCount: Math.max(bucket.human.categories, bucket.ai.categories),
                humanScore: bucket.human.score,
                aiScore: bucket.ai.score,
                major: bucket.major,
            });
        }
        return pairs;
    }
}
