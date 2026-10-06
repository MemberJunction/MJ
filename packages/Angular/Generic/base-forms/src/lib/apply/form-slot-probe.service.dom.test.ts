import { describe, it, expect, vi, afterEach } from 'vitest';
import type { ViewContainerRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { IMetadataProvider } from '@memberjunction/core';
import { FormSlotProbeService, type ProbedFormShape } from './form-slot-probe.service';

/**
 * The probe renders an entity's form offscreen to learn its slots, sections and rail, and keeps
 * the answer for the session. A panel added, moved or hidden changes that answer, so the drawer
 * and the apply flow drop it after each write; these cover the memo, not the render.
 */

const HOST = {} as ViewContainerRef;
const PROVIDER = {} as IMetadataProvider;

function shape(slots: ProbedFormShape['Slots']): ProbedFormShape {
    return { Slots: slots, Sections: [], Panels: [], Groups: [], Layout: 'accordion' };
}

type RenderProto = { render: (host: ViewContainerRef, entity: string, provider: IMetadataProvider | undefined) => Promise<ProbedFormShape> };

/** Replaces the offscreen render, so each call answers with the next shape. */
function stubRender(...answers: Array<ProbedFormShape | Promise<ProbedFormShape>>) {
    const queue = [...answers];
    return vi.spyOn(FormSlotProbeService.prototype as unknown as RenderProto, 'render')
        .mockImplementation(async () => (await queue.shift()) ?? shape(['after-everything']));
}

afterEach(() => vi.restoreAllMocks());

describe('FormSlotProbeService', () => {
    it('reads a form once and answers from memory after that, whatever the casing', async () => {
        const render = stubRender(shape(['before-fields', 'after-everything']));
        const probe = TestBed.inject(FormSlotProbeService);
        await probe.Probe(HOST, 'MoreCheese: Courses', PROVIDER);
        const again = await probe.Probe(HOST, ' morecheese: courses ', PROVIDER);
        expect(render).toHaveBeenCalledTimes(1);
        expect(again.Slots).toEqual(['before-fields', 'after-everything']);
    });

    it('reads the form again after Forget for that entity', async () => {
        const render = stubRender(shape(['before-fields']), shape(['after-fields']));
        const probe = TestBed.inject(FormSlotProbeService);
        await probe.Probe(HOST, 'MoreCheese: Courses', PROVIDER);
        probe.Forget('MoreCheese: Courses');
        const fresh = await probe.Probe(HOST, 'MoreCheese: Courses', PROVIDER);
        expect(render).toHaveBeenCalledTimes(2);
        expect(fresh.Slots).toEqual(['after-fields']);
    });

    it('keeps other entities when one is forgotten, and drops them all when none is named', async () => {
        const render = stubRender(shape(['before-fields']), shape(['before-fields']), shape(['before-fields']));
        const probe = TestBed.inject(FormSlotProbeService);
        await probe.Probe(HOST, 'A', PROVIDER);
        await probe.Probe(HOST, 'B', PROVIDER);
        probe.Forget('A');
        await probe.Probe(HOST, 'B', PROVIDER);
        expect(render).toHaveBeenCalledTimes(2);
        probe.Forget();
        await probe.Probe(HOST, 'B', PROVIDER);
        expect(render).toHaveBeenCalledTimes(3);
    });

    it('renders one form for two callers asking at once', async () => {
        const render = stubRender(shape(['before-fields']));
        const probe = TestBed.inject(FormSlotProbeService);
        await Promise.all([probe.Probe(HOST, 'A', PROVIDER), probe.Probe(HOST, 'A', PROVIDER)]);
        expect(render).toHaveBeenCalledTimes(1);
    });

    it('does not keep a reading that a Forget overtook', async () => {
        let finish: (value: ProbedFormShape) => void = () => undefined;
        const slow = new Promise<ProbedFormShape>((resolve) => { finish = resolve; });
        const render = stubRender(slow, shape(['after-fields']));
        const probe = TestBed.inject(FormSlotProbeService);
        const first = probe.Probe(HOST, 'A', PROVIDER);
        probe.Forget('A');
        finish(shape(['before-fields']));
        await first;
        const next = await probe.Probe(HOST, 'A', PROVIDER);
        expect(render).toHaveBeenCalledTimes(2);
        expect(next.Slots).toEqual(['after-fields']);
    });

    it('does not keep a form that drew no slots, so a later read can still answer', async () => {
        const render = stubRender(shape([]), shape(['before-fields']));
        const probe = TestBed.inject(FormSlotProbeService);
        await probe.Probe(HOST, 'A', PROVIDER);
        const second = await probe.Probe(HOST, 'A', PROVIDER);
        expect(render).toHaveBeenCalledTimes(2);
        expect(second.Slots).toEqual(['before-fields']);
    });

    it('answers nothing for a blank entity name without rendering', async () => {
        const render = stubRender();
        const probe = TestBed.inject(FormSlotProbeService);
        expect((await probe.Probe(HOST, '  ', PROVIDER)).Slots).toEqual([]);
        expect(render).not.toHaveBeenCalled();
    });
});
