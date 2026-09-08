/**
 * @fileoverview Condition evaluation for durable graph edges.
 *
 * Wraps the same `SafeExpressionEvaluator` the design-time flow executor uses. Sharing the evaluator
 * is not incidental — it is what makes an edge condition mean the same thing whether it was drawn in
 * the flow editor or emitted by an agent, which is the premise Save as Workflow (D17) rests on.
 *
 * @module @memberjunction/task-graph
 */
import { SafeExpressionEvaluator } from '@memberjunction/global';
import type { IConditionEvaluator } from '@memberjunction/ai-core-plus';

export class DispatcherConditionEvaluator implements IConditionEvaluator {
    private readonly evaluator = new SafeExpressionEvaluator();

    public Evaluate(expression: string, context: Record<string, unknown>): { Success: boolean; Value?: unknown; ErrorMessage?: string } {
        try {
            const result = this.evaluator.evaluate(expression, context);
            return result.success
                ? { Success: true, Value: result.value }
                : { Success: false, ErrorMessage: String(result.error ?? 'condition evaluation failed') };
        } catch (e) {
            return { Success: false, ErrorMessage: e instanceof Error ? e.message : String(e) };
        }
    }
}
