import { describe, it, expect } from 'vitest';
import { AgentEventStream, type AgentStreamEvent } from '../agent-stream-events';

/** Drain a stream into an array of events. */
async function collect(stream: AgentEventStream): Promise<AgentStreamEvent[]> {
    const events: AgentStreamEvent[] = [];
    for await (const ev of stream) {
        events.push(ev);
    }
    return events;
}

describe('AgentEventStream', () => {
    describe('normal completion', () => {
        it('emits TurnStart -> TextStart -> TextDelta* -> TextEnd -> TurnEnd -> Done in order', async () => {
            const s = new AgentEventStream();
            s.EmitTurnStart();
            s.EmitTextDelta('Hello');
            s.EmitTextDelta(' there');
            s.Complete('Stop');

            const events = await collect(s);
            expect(events.map((e) => e.Kind)).toEqual([
                'TurnStart',
                'TextStart',
                'TextDelta',
                'TextDelta',
                'TextEnd',
                'TurnEnd',
                'Done',
            ]);
        });

        it('accumulates Partial.Text across deltas', async () => {
            const s = new AgentEventStream();
            s.EmitTextDelta('Hel');
            s.EmitTextDelta('lo');
            s.Complete();

            const events = await collect(s);
            const deltas = events.filter((e) => e.Kind === 'TextDelta');
            expect(deltas.map((e) => (e as { Partial: { Text: string } }).Partial.Text)).toEqual(['Hel', 'Hello']);
            const done = events.find((e) => e.Kind === 'Done');
            expect(done && (done as { Final: { Text: string } }).Final.Text).toBe('Hello');
        });

        it('result() resolves with the assembled final turn', async () => {
            const s = new AgentEventStream();
            s.EmitTextDelta('Answer.');
            s.Complete();
            await collect(s);
            const final = await s.result();
            expect(final.Text).toBe('Answer.');
            expect(final.IsComplete).toBe(true);
        });

        it('retained early events keep their own Partial snapshot', async () => {
            const s = new AgentEventStream();
            s.EmitTextDelta('A');
            s.EmitTextDelta('B');
            s.Complete();
            const events = await collect(s);
            const firstDelta = events.find((e) => e.Kind === 'TextDelta') as { Partial: { Text: string } };
            // first delta's Partial must still read 'A', not the mutated-final 'AB'
            expect(firstDelta.Partial.Text).toBe('A');
        });

        it('suppresses thinking from Text but accumulates it on Partial.Thinking', async () => {
            const s = new AgentEventStream();
            s.EmitThinkingDelta('reasoning...');
            s.EmitTextDelta('spoken');
            s.Complete();
            const final = await s.result();
            expect(final.Text).toBe('spoken');
            expect(final.Thinking).toBe('reasoning...');
        });

        it('omits TextStart/TextEnd when no text was emitted', async () => {
            const s = new AgentEventStream();
            s.EmitTurnStart();
            s.Complete();
            const kinds = (await collect(s)).map((e) => e.Kind);
            expect(kinds).not.toContain('TextStart');
            expect(kinds).not.toContain('TextEnd');
            expect(kinds).toContain('Done');
        });

        it('ignores empty deltas', async () => {
            const s = new AgentEventStream();
            s.EmitTextDelta('');
            s.EmitTextDelta('x');
            s.Complete();
            const deltas = (await collect(s)).filter((e) => e.Kind === 'TextDelta');
            expect(deltas).toHaveLength(1);
        });
    });

    describe('errors as values', () => {
        it('emits a single terminal Error event carrying the partial, no throw', async () => {
            const s = new AgentEventStream();
            s.EmitTextDelta('partial ans');
            s.Fail('Error', 'provider hiccup');

            const events = await collect(s);
            const err = events.find((e) => e.Kind === 'Error') as
                | { Kind: 'Error'; Reason: string; Error: { Text: string }; Message?: string }
                | undefined;
            expect(err).toBeDefined();
            expect(err!.Reason).toBe('Error');
            expect(err!.Error.Text).toBe('partial ans');
            expect(err!.Message).toBe('provider hiccup');
            // exactly one terminal event; no Done after Error
            expect(events.filter((e) => e.Kind === 'Done')).toHaveLength(0);
        });

        it('result() resolves (does not reject) with the partial on Fail', async () => {
            const s = new AgentEventStream();
            s.EmitTextDelta('half');
            s.Fail('Aborted');
            await collect(s);
            await expect(s.result()).resolves.toMatchObject({ Text: 'half', IsComplete: true });
        });
    });

    describe('idempotency / settled guards', () => {
        it('ignores Emit/Complete/Fail after a terminal event', async () => {
            const s = new AgentEventStream();
            s.EmitTextDelta('one');
            s.Complete();
            // these must all be no-ops
            s.EmitTextDelta('two');
            s.Complete();
            s.Fail('Error');

            const events = await collect(s);
            expect(events.filter((e) => e.Kind === 'Done')).toHaveLength(1);
            expect(events.filter((e) => e.Kind === 'Error')).toHaveLength(0);
            const final = await s.result();
            expect(final.Text).toBe('one');
        });
    });
});
