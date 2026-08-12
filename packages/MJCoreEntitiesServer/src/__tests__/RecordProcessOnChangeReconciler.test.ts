/**
 * Tests for the Record Process on-change trigger's decision and its per-invocation scope script.
 *
 * Row reconciliation itself needs a live provider and is covered by the integration tier, matching
 * how `WorkflowSpecSync` is split. What is worth pinning here is the pair of things that fail
 * *silently* if wrong: the decision to own an active binding at all, and the script string that
 * turns the changed record into the action's scope. A typo in that script does not throw — the
 * engine's script evaluator swallows it and returns null, and the process then runs against nothing
 * while the trigger reports success.
 */
import { describe, it, expect } from 'vitest';
import { decideOnChangeAction, ON_CHANGE_SCOPE_SCRIPT, RUN_RECORD_PROCESS_ACTION } from '../custom/RecordProcessOnChangeReconciler';

const decide = (over: Partial<Parameters<typeof decideOnChangeAction>[0]> = {}) =>
    decideOnChangeAction({ status: 'Active', onChangeEnabled: true, onChangeInvocationType: 'AfterUpdate', ...over });

describe('decideOnChangeAction', () => {
    it('owns an active binding when the process is Active with the trigger on', () => {
        expect(decide()).toBe('upsert');
    });

    it('disables when the trigger is off', () => {
        expect(decide({ onChangeEnabled: false })).toBe('disable');
    });

    it('disables when the process is not Active', () => {
        // A Disabled process that kept firing on save is the failure mode the whole reconciler
        // exists to prevent — the definition says stopped, the substrate says running.
        expect(decide({ status: 'Disabled' })).toBe('disable');
        expect(decide({ status: 'Draft' })).toBe('disable');
    });

    it('disables when no invocation type was chosen, rather than guessing one', () => {
        // Defaulting to AfterUpdate would fire on an event the author never picked, and there is no
        // error to notice — only runs nobody expected.
        expect(decide({ onChangeInvocationType: null })).toBe('disable');
    });
});

describe('ON_CHANGE_SCOPE_SCRIPT', () => {
    /** Runs the script exactly as `EntityActionInvocationBase.SafeEvalScript` does. */
    async function evaluate(entityObject: unknown): Promise<string> {
        const context: { entityObject: unknown; result: unknown } = { entityObject, result: null };
        const fn = new Function('EntityActionContext', `return (async () => { ${ON_CHANGE_SCOPE_SCRIPT} })();`);
        const returned = await fn(context);
        return String(returned ?? context.result);
    }

    const record = (id: string) => ({
        PrimaryKey: { ToConcatenatedString: () => id, ToString: () => `ID=${id}` },
    });

    it('produces the records-scope shape the executor understands', async () => {
        const scope = JSON.parse(await evaluate(record('ID|rec-1')));
        expect(scope).toEqual({ Kind: 'records', RecordIDs: ['ID|rec-1'] });
    });

    it('uses the concatenated key, not the display form', async () => {
        // RecordRef.RecordID is documented as the primary key "serialized to a composite-key-safe
        // string". ToString() is a display format and would fail to resolve a composite key.
        const scope = JSON.parse(await evaluate(record('ID|rec-1')));
        expect(scope.RecordIDs[0]).toBe('ID|rec-1');
        expect(scope.RecordIDs[0]).not.toContain('=');
    });

    it('assigns through EntityActionContext.result, which is what the evaluator reads back', async () => {
        // The script has no `return`; SafeEvalScript falls back to context.result. If the script were
        // written to return instead, the value would still arrive — but the reverse (assigning a
        // name the evaluator does not read) yields null and a run against an empty scope.
        const context: { entityObject: unknown; result: unknown } = { entityObject: record('ID|x'), result: null };
        const fn = new Function('EntityActionContext', `return (async () => { ${ON_CHANGE_SCOPE_SCRIPT} })();`);
        await fn(context);
        expect(typeof context.result).toBe('string');
    });
});

describe('the action it binds to', () => {
    it('names an action that already exists, rather than inventing one', () => {
        expect(RUN_RECORD_PROCESS_ACTION).toBe('Run Record Process');
    });
});
