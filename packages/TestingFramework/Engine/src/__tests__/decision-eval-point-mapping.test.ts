/**
 * @fileoverview Mapping a corpus point to the routing decision's input, through the shared builders.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    BuildRecentTurns,
    BuildRoutingQuestions,
    BuildRoutingState,
    BuildRoutingStateStructured,
    CanAskRoutingDecision,
    type RoutingAgent
} from '@memberjunction/ai-core-plus';
import { ParseDecisionCorpus } from '../decision-eval/corpus';
import { HistoryBeforeMessage, MapPointToRoutingInput, type DecisionEvalAgentCatalog } from '../decision-eval/point-mapping';
import type { DecisionCorpusPoint } from '../decision-eval/types';

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures/decision-eval');
const POINTS = ParseDecisionCorpus(readFileSync(join(FIXTURE_DIR, 'corpus.jsonl'), 'utf8'));
const pointNumber = (n: number): DecisionCorpusPoint => {
    const found = POINTS.find(p => p.id.endsWith(String(n).padStart(12, '0')));
    if (!found) {
        throw new Error(`fixture point ${n} missing`);
    }
    return found;
};

const LEDGER_ID = 'A1000000-0000-4000-8000-000000000001';
const CALENDAR_ID = 'A1000000-0000-4000-8000-000000000002';
const MEMO_ID = 'A1000000-0000-4000-8000-000000000003';
const SAGE: RoutingAgent = { ID: 'A1000000-0000-4000-8000-0000000000FF', Name: 'Sage', Description: 'Routes each request.' };

/** The engine knows the Ledger Helper by a newer description, and Sage; nobody else. */
const ENGINE_AGENTS: RoutingAgent[] = [
    { ID: LEDGER_ID, Name: 'Ledger Helper', Description: 'Engine description: expenses and reimbursements.' },
    SAGE
];
const CATALOG: DecisionEvalAgentCatalog = {
    FindAgent: id => ENGINE_AGENTS.find(a => a.ID.toUpperCase() === id.toUpperCase()),
    ConversationManager: SAGE
};

describe('MapPointToRoutingInput', () => {
    it('maps the message, the previous agent and a null allowed list', () => {
        const input = MapPointToRoutingInput(pointNumber(1), CATALOG);
        expect(input.Message).toBe('Make it 30 minutes instead of an hour.');
        expect(input.ContinuityAgentId).toBe(CALENDAR_ID);
        expect(input.AllowedAgentIDs).toBeNull();
        expect(input.ConversationManager).toBe(SAGE);
    });

    it('resolves participants through the catalog, falling back to the point\'s own names', () => {
        const input = MapPointToRoutingInput(pointNumber(2), CATALOG);
        expect(input.Participants.map(p => p.Agent.ID)).toEqual([CALENDAR_ID, LEDGER_ID]);
        // The engine knows the Ledger Helper; the Calendar Coordinator comes from the point.
        expect(input.Participants[1].Agent.Description).toBe('Engine description: expenses and reimbursements.');
        expect(input.Participants[0].Agent).toEqual({
            ID: CALENDAR_ID, Name: 'Calendar Coordinator', Description: 'Schedules meetings and finds free time on shared calendars.'
        });
    });

    it('describes a non-previous agent the engine lacks by its history name alone', () => {
        const input = MapPointToRoutingInput(pointNumber(4), CATALOG);
        const supply = input.Participants.find(p => p.Agent.Name === 'Supply Clerk');
        expect(supply?.Agent.Description).toBeNull();
    });

    it('leaves the conversation manager out of the participants', () => {
        const input = MapPointToRoutingInput(pointNumber(11), CATALOG);
        expect(input.Participants.map(p => p.Agent.ID)).toEqual([MEMO_ID]);
        expect(input.RecentTurns).toContain('Sage: I will hand this to the Memo Drafter.');
    });

    it('builds the recent turns with the shared builder, and keeps their parts', () => {
        const point = pointNumber(7);
        const input = MapPointToRoutingInput(point, CATALOG);
        expect(input.RecentTurns).toHaveLength(6);
        expect(input.RecentTurns[0]).toBe('User: How many whiteboard markers are left in the cupboard?');
        expect(input.RecentTurnParts?.map(t => `${t.Speaker}: ${t.Message}`)).toEqual(input.RecentTurns);
    });

    it('offers the point\'s artifacts as the previous agent\'s', () => {
        const input = MapPointToRoutingInput(pointNumber(3), CATALOG);
        expect(input.ArtifactVersions.map(v => [v.AgentId, v.ArtifactVersionId])).toEqual([
            [MEMO_ID, 'F5100000-0000-4000-8000-000000000002'],
            [MEMO_ID, 'F5100000-0000-4000-8000-000000000001']
        ]);
        expect(input.ArtifactVersions[0].Description).toBe('"Office move memo" (Document), version 2 "Weekend move", the latest, made by Memo Drafter');
        expect(input.ContinuityArtifacts?.[0].artifactName).toBe('Office move memo');
    });

    it('is something to decide on every fixture point when the engine has Sage', () => {
        expect(POINTS.every(p => CanAskRoutingDecision(MapPointToRoutingInput(p, CATALOG)))).toBe(true);
    });

    it('has nothing to decide with a single participant and no conversation manager', () => {
        const input = MapPointToRoutingInput(pointNumber(1), { ...CATALOG, ConversationManager: null });
        expect(CanAskRoutingDecision(input)).toBe(false);
    });

    it('feeds the shared builders unchanged', () => {
        const input = MapPointToRoutingInput(pointNumber(3), CATALOG);
        const questions = BuildRoutingQuestions(input);
        expect(Object.keys(questions)).toEqual(['route', 'continues', 'artifact']);
        expect(BuildRoutingState(input)).toContain('The user\'s new message:\nAdd a line about where visitors should park.');
        const structured = BuildRoutingStateStructured(input);
        expect(structured.previous_agent).toEqual({ name: 'Memo Drafter', description: 'Drafts and edits internal memos and announcements.' });
        expect(structured.recent_conversation).toHaveLength(4);
        expect(structured.previous_agent_artifacts[0].versions).toEqual([{ number: 2, name: 'Weekend move' }, { number: 1, name: null }]);
    });
});

describe('HistoryBeforeMessage', () => {
    it('keeps the history as it is when it ends before the new message', () => {
        const point = pointNumber(1);
        expect(HistoryBeforeMessage(point).map(r => r.ID)).toEqual(point.history.map(h => h.id));
    });

    it('drops a trailing copy of the new message, and a row carrying the point\'s own ID', () => {
        const point = pointNumber(1);
        const echo = { ...point.history[0], id: point.id, message: 'something else' };
        const trailing = { ...point.history[0], id: 'C2000000-0000-4000-8000-0000000009AA', message: `  ${point.latest_message} ` };
        const rows = HistoryBeforeMessage({ ...point, history: [...point.history, echo, trailing] });
        expect(rows.map(r => r.ID)).toEqual(point.history.map(h => h.id));
        expect(BuildRecentTurns(rows, () => undefined)).not.toContain(`User: ${point.latest_message}`);
    });
});
