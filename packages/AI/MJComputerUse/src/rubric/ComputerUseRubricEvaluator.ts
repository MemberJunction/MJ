import { RegisterClass } from '@memberjunction/global';
import { BaseRubricEvaluator, type RubricCandidate, type RubricEvaluatorContext, type RubricEvaluatorRun, type RubricEvaluatorType } from '@memberjunction/rubrics';
import type { RubricVersionSnapshot } from '@memberjunction/rubrics-base';

/** One verdict the in-run judge returned for a criterion, as the driver saved it. */
export interface JudgeCriterionVerdict {
    key?: string;
    criterion: string;
    met: boolean;
    level?: string;
    evidence?: string;
}

/**
 * Scores a computer use run from the verdicts its in-run judge already returned. No model
 * call: the judge prompt run that produced the verdicts is linked as the evaluation's prompt run.
 */
@RegisterClass(BaseRubricEvaluator, 'ComputerUse')
export class ComputerUseRubricEvaluator extends BaseRubricEvaluator {
    public get EvaluatorName(): string {
        return 'ComputerUse';
    }

    public get EvaluatorType(): RubricEvaluatorType {
        return 'AIPrompt';
    }

    /** Maps the saved verdicts onto the version's leaves and scores them through RubricScoring. */
    public async EvaluateRubric(context: RubricEvaluatorContext): Promise<RubricEvaluatorRun> {
        const data = context.Content.data ?? {};
        const verdicts = Array.isArray(data.criteriaVerdicts) ? data.criteriaVerdicts as JudgeCriterionVerdict[] : [];
        if (verdicts.length === 0) throw new Error('The run produced no rubric verdicts.');
        const { candidates, unmatched } = CandidatesFromVerdicts(context.Version, verdicts);
        const promptRunId = typeof data.finalJudgePromptRunId === 'string' ? data.finalJudgePromptRunId : null;
        return { ...this.Evaluate(context.Version, candidates), aiPromptRunId: promptRunId, metadata: { Source: 'ComputerUseJudge', Unmatched: unmatched } };
    }
}

/**
 * Maps verdicts onto the version's leaves by key, then by name. A level label picks that
 * level; otherwise `met` picks the highest or the lowest level. Unmatched verdicts are listed.
 */
export function CandidatesFromVerdicts(version: RubricVersionSnapshot, verdicts: JudgeCriterionVerdict[]): { candidates: RubricCandidate[]; unmatched: string[] } {
    const leaves = version.nodes.filter(node => node.nodeType === 'Criterion');
    const candidates: RubricCandidate[] = [];
    const unmatched: string[] = [];
    for (const verdict of verdicts) {
        const node = (verdict.key ? leaves.find(leaf => leaf.key === verdict.key) : undefined)
            ?? leaves.find(leaf => leaf.name === verdict.criterion);
        if (!node) {
            unmatched.push(verdict.key ?? verdict.criterion);
            continue;
        }
        const scale = version.scales.find(item => item.id === node.scaleId);
        const levels = [...(scale?.levels ?? [])].sort((a, b) => a.normalizedValue - b.normalizedValue);
        const byLabel = verdict.level ? levels.find(level => level.label === verdict.level) : undefined;
        const level = byLabel ?? (verdict.met ? levels[levels.length - 1] : levels[0]);
        if (!level) {
            unmatched.push(node.key);
            continue;
        }
        candidates.push({ criterionId: node.id, scaleLevelId: level.id, rationale: verdict.evidence ?? '', evidence: [] });
    }
    return { candidates, unmatched };
}
