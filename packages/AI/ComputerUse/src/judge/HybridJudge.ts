/**
 * Hybrid judge that combines heuristic and LLM evaluation.
 *
 * Strategy:
 * 1. If the controller explicitly requested judgement, skip heuristics
 *    and go straight to the LLM — the controller is signaling a state
 *    change (completion, impossibility, milestone) that only the LLM
 *    can evaluate.
 * 2. Otherwise, run HeuristicJudge first (free — no LLM calls)
 * 3. If heuristics detect a problem (Confidence > 0), use that verdict
 * 4. If heuristics are inconclusive (Confidence = 0), invoke LLMJudge
 *
 * This is the recommended default judge strategy — it provides the
 * best cost/accuracy tradeoff. Heuristics catch obvious failure states
 * (stuck, loops, errors) without spending tokens. The LLM handles
 * nuanced goal completion assessment.
 *
 * Uses composition (not inheritance) to combine the two judges.
 * No inheritance diamond — clean and predictable.
 */

import { BaseJudge } from './BaseJudge.js';
import { HeuristicJudge } from './HeuristicJudge.js';
import { LLMJudge } from './LLMJudge.js';
import { JudgeContext, JudgeVerdict } from '../types/judge.js';

export class HybridJudge extends BaseJudge {
    private heuristicJudge: HeuristicJudge;
    private llmJudge: LLMJudge;

    constructor(heuristicJudge: HeuristicJudge, llmJudge: LLMJudge) {
        super();
        this.heuristicJudge = heuristicJudge;
        this.llmJudge = llmJudge;
    }

    public override get Type(): string {
        return 'Hybrid';
    }

    public override async Evaluate(context: JudgeContext): Promise<JudgeVerdict> {
        // If the controller explicitly requested judgement, always use the LLM.
        if (context.ControllerRequestedJudgement) {
            return this.llmJudge.Evaluate(context);
        }

        // Step 1: Run heuristics (free)
        const heuristicVerdict = await this.heuristicJudge.Evaluate(context);

        // Step 2: If heuristics found something (confidence > 0), use it
        if (heuristicVerdict.Confidence > 0) {
            return heuristicVerdict;
        }

        // Step 3: Heuristics inconclusive — invoke the LLM
        return this.llmJudge.Evaluate(context);
    }
}
