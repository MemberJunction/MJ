import { describe, it, expect, vi } from 'vitest';
import { CHANNEL_OPEN_ACTION, ChannelActionDispatcher, type DispatchableChannel } from '../channels/channel-action-dispatcher';
import type { BaseRealtimeChannelClient } from '../channels/base-realtime-channel-client';
import { FormChannel, LegacyEchoChannel, makeChannelContext } from './channel-test-helpers';

/** A dispatcher over a mutable set of channels, with a recorded ActivateChannel. */
function build(channels: Array<{ plugin: BaseRealtimeChannelClient; open: boolean }>) {
    const state = channels.map((c) => ({ ...c }));
    const activate = vi.fn(async (plugin: BaseRealtimeChannelClient) => {
        const entry = state.find((c) => c.plugin === plugin);
        if (entry) {
            entry.open = true;
        }
    });
    const dispatcher = new ChannelActionDispatcher({
        FindChannel: (key: string): DispatchableChannel | null => {
            const entry = state.find((c) => c.plugin.ChannelName.toLowerCase() === key.toLowerCase());
            return entry ? { Plugin: entry.plugin, IsOpen: entry.open } : null;
        },
        ListChannelKeys: () => state.map((c) => c.plugin.ChannelName),
        ActivateChannel: activate,
    });
    return { dispatcher, activate, state };
}

function openForm(): FormChannel {
    const form = new FormChannel();
    form.Initialize(makeChannelContext());
    return form;
}

describe('ChannelActionDispatcher', () => {
    it('refuses an unknown channel and lists the ones that exist', async () => {
        const { dispatcher } = build([{ plugin: openForm(), open: true }]);
        const result = await dispatcher.Dispatch({ Target: { Channel: 'Nope' }, Action: 'SetField', Params: {} });
        expect(result).toMatchObject({ Success: false, ErrorCode: 'unknown_channel', Available: ['Form'] });
    });

    it('matches the channel and the verb case-insensitively and runs the verb', async () => {
        const form = openForm();
        const { dispatcher } = build([{ plugin: form, open: true }]);
        const result = await dispatcher.Dispatch({ Target: { Channel: 'form' }, Action: 'setfield', Params: { name: 'name', value: 'Ada' } });
        expect(result).toEqual({ Success: true, Result: { set: true } });
        expect(form.State).toEqual({ fields: { name: 'Ada' } });
    });

    it('refuses an instance a single-instance channel does not have', async () => {
        const { dispatcher } = build([{ plugin: openForm(), open: true }]);
        const result = await dispatcher.Dispatch({ Target: { Channel: 'Form', Instance: '9' }, Action: 'SetField', Params: {} });
        expect(result).toMatchObject({ ErrorCode: 'unknown_instance', Available: ['1'] });
    });

    it('accepts the primary instance id explicitly', async () => {
        const { dispatcher } = build([{ plugin: openForm(), open: true }]);
        const result = await dispatcher.Dispatch({ Target: { Channel: 'Form', Instance: '1' }, Action: 'SetField', Params: { name: 'name', value: 'x' } });
        expect(result.Success).toBe(true);
    });

    it('refuses a verb the channel does not have and lists the agent-invokable ones', async () => {
        const { dispatcher } = build([{ plugin: openForm(), open: true }]);
        const result = await dispatcher.Dispatch({ Target: { Channel: 'Form' }, Action: 'Explode', Params: {} });
        expect(result).toMatchObject({ ErrorCode: 'unknown_verb', Available: ['SetField'] });
    });

    it('refuses a user-only verb for the agent', async () => {
        const { dispatcher } = build([{ plugin: openForm(), open: true }]);
        const result = await dispatcher.Dispatch({ Target: { Channel: 'Form' }, Action: 'Confirm', Params: {} });
        expect(result).toMatchObject({ Success: false, ErrorCode: 'not_invokable_by_agent' });
    });

    it('validates params against the verb schema and returns every violation, never half-applying', async () => {
        const form = openForm();
        const { dispatcher } = build([{ plugin: form, open: true }]);
        const result = await dispatcher.Dispatch({ Target: { Channel: 'Form' }, Action: 'SetField', Params: { name: 5, extra: true } });
        expect(result.ErrorCode).toBe('invalid_params');
        expect(result.ErrorMessage).toContain('SetField(name:string, value:string)');
        expect(result.Details?.length).toBeGreaterThanOrEqual(2);
        expect(form.State).toEqual({ fields: { name: '' } }); // untouched
    });

    it('maps a verb failure to verb_failed and a throw to a contained verb_failed', async () => {
        class Throwing extends FormChannel {
            public override ApplyVerb(): never {
                throw new Error('kaboom');
            }
        }
        const t = new Throwing();
        t.Initialize(makeChannelContext());
        const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const { dispatcher } = build([{ plugin: t, open: true }]);
        const result = await dispatcher.Dispatch({ Target: { Channel: 'Form' }, Action: 'SetField', Params: { name: 'a', value: 'b' } });
        expect(result).toMatchObject({ Success: false, ErrorCode: 'verb_failed' });
        expect(result.ErrorMessage).toContain('kaboom');
        spy.mockRestore();
    });

    it('requires an unopened on-demand channel to be opened first', async () => {
        const form = new FormChannel();
        const { dispatcher, activate } = build([{ plugin: form, open: false }]);
        const result = await dispatcher.Dispatch({ Target: { Channel: 'Form' }, Action: 'SetField', Params: { name: 'a', value: 'b' } });
        expect(result.ErrorCode).toBe('channel_not_open');
        expect(result.ErrorMessage).toContain(`action "${CHANNEL_OPEN_ACTION}"`);
        expect(activate).not.toHaveBeenCalled();
    });

    it('open mounts an unopened channel, seeds it with the inputs, and then verbs work', async () => {
        const form = new FormChannel();
        form.Initialize(makeChannelContext()); // the host initializes it inside ActivateChannel in production
        const { dispatcher, activate } = build([{ plugin: form, open: false }]);
        const opened = await dispatcher.Dispatch({ Target: { Channel: 'Form' }, Action: 'open', Params: { title: 'Signup' } });
        expect(activate).toHaveBeenCalledWith(form);
        expect(opened).toMatchObject({ Success: true, Result: { opened: true, channel: 'Form' } });
        expect(form.Opened).toEqual({ title: 'Signup' });
        const ran = await dispatcher.Dispatch({ Target: { Channel: 'Form' }, Action: 'SetField', Params: { name: 'a', value: 'b' } });
        expect(ran.Success).toBe(true);
    });

    it('open reports invalid_params for bad inputs and does not mount twice for an already-open channel', async () => {
        const form = openForm();
        const { dispatcher, activate } = build([{ plugin: form, open: true }]);
        const bad = await dispatcher.Dispatch({ Target: { Channel: 'Form' }, Action: 'open', Params: {} });
        expect(bad.ErrorCode).toBe('invalid_params');
        expect(activate).not.toHaveBeenCalled();
    });

    it('open_failed when mounting throws', async () => {
        const form = new FormChannel();
        const dispatcher = new ChannelActionDispatcher({
            FindChannel: () => ({ Plugin: form, IsOpen: false }),
            ListChannelKeys: () => ['Form'],
            ActivateChannel: async () => {
                throw new Error('cannot mount');
            },
        });
        const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const result = await dispatcher.Dispatch({ Target: { Channel: 'Form' }, Action: 'open', Params: { title: 't' } });
        expect(result).toMatchObject({ ErrorCode: 'open_failed' });
        expect(result.ErrorMessage).toContain('cannot mount');
        spy.mockRestore();
    });

    it('runs a legacy channel verb through its native tool', async () => {
        const echo = new LegacyEchoChannel();
        echo.Initialize(makeChannelContext());
        const { dispatcher } = build([{ plugin: echo, open: true }]);
        const result = await dispatcher.Dispatch({ Target: { Channel: 'Echo' }, Action: 'Say', Params: { phrase: 'hello' } });
        expect(result.Success).toBe(true);
        expect(echo.Applied[0].ToolName).toBe('Echo_Say');
        const missing = await dispatcher.Dispatch({ Target: { Channel: 'Echo' }, Action: 'Say', Params: {} });
        expect(missing.ErrorCode).toBe('invalid_params'); // legacy tools now get schema validation at the proxy
    });
});
