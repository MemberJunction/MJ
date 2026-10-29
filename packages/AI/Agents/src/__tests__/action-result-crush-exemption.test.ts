/**
 * Per-action exemption from action-result crushing (`uncrushedActions`).
 *
 * Crushing shortens large structured results to save tokens, which is right for search results
 * and wrong for exact payloads — generated code or a specification the model must read
 * verbatim. The exemption is by Action name, so one agent can crush its searches and keep its
 * code-generation results whole. Runs the real BaseAgent formatter and context-crush engine.
 */
import { describe, it, expect } from 'vitest';
import { BaseAgent } from '../base-agent';
import type { ExecuteAgentParams } from '@memberjunction/ai-core-plus';

interface SummaryLike { actionName: string; success: boolean; resultCode: string; message: string; params: Array<{ Name: string; Value: unknown }> }

class Probe extends BaseAgent {
    public Configure(promptParams: Record<string, unknown>): void {
        const internals = this as unknown as { _actionResultCrush: unknown };
        internals._actionResultCrush = this.resolveActionResultCrush({ data: { __agentTypePromptParams: promptParams } } as unknown as ExecuteAgentParams);
    }
    public Format(summaries: SummaryLike[]): string {
        return (this as unknown as { formatActionResultsAsMarkdown(s: SummaryLike[]): string }).formatActionResultsAsMarkdown(summaries);
    }
}

/** A large, repetitive JSON result — the shape crushing exists for. */
const rows = Array.from({ length: 60 }, (_, i) => ({ id: i, name: `Customer ${i}`, region: 'North', status: 'Active', balance: 1000 + i }));
const summary = (actionName: string): SummaryLike =>
    ({ actionName, success: true, resultCode: 'SUCCESS', message: 'ok', params: [{ Name: 'Results', Value: rows }] });

describe('uncrushedActions', () => {
    it('crushes a large result by default', () => {
        const probe = new Probe();
        probe.Configure({});

        expect(probe.Format([summary('Search Customers')])).not.toContain(JSON.stringify(rows));
    });

    it('returns an exempt action\'s result verbatim, and still crushes the others', () => {
        const probe = new Probe();
        probe.Configure({ uncrushedActions: ['Generate Component Code'] });

        expect(probe.Format([summary('Generate Component Code')])).toContain(JSON.stringify(rows));
        expect(probe.Format([summary('Search Customers')])).not.toContain(JSON.stringify(rows));
    });

    it('ignores entries that are not strings', () => {
        const probe = new Probe();
        probe.Configure({ uncrushedActions: [42, null, 'Generate Component Code'] });

        expect(probe.Format([summary('Generate Component Code')])).toContain(JSON.stringify(rows));
    });
});
