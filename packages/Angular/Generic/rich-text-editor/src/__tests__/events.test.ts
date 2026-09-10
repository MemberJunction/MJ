import { describe, it, expect, vi } from 'vitest';
import { RichTextEventEmitter } from '../lib/engine/events';

describe('RichTextEventEmitter', () => {
    it('delivers payloads to handlers', () => {
        const emitter = new RichTextEventEmitter(() => undefined);
        const handler = vi.fn();
        emitter.On('pathChange', handler);
        emitter.Emit('pathChange', { Path: 'DIV>B' });
        expect(handler).toHaveBeenCalledWith({ Path: 'DIV>B' });
    });

    it('stops delivering after Off', () => {
        const emitter = new RichTextEventEmitter(() => undefined);
        const handler = vi.fn();
        emitter.On('input', handler);
        emitter.Off('input', handler);
        emitter.Emit('input', undefined);
        expect(handler).not.toHaveBeenCalled();
    });

    it('routes a throwing handler to the error sink and keeps going', () => {
        const errors: unknown[] = [];
        const emitter = new RichTextEventEmitter((error) => errors.push(error));
        const second = vi.fn();
        emitter.On('focus', () => {
            throw new Error('boom');
        });
        emitter.On('focus', second);
        emitter.Emit('focus', undefined);
        expect(errors).toHaveLength(1);
        expect(second).toHaveBeenCalled();
    });
});
