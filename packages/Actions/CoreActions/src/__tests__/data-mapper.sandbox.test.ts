/**
 * The Data Mapper action renders a mapping template its caller supplies. Its nunjucks environments are
 * built sandboxed by the action itself; nothing here loads `@memberjunction/templates`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';

vi.mock('@memberjunction/global', () => ({
    RegisterClass: () => (target: unknown) => target,
}));

vi.mock('@memberjunction/actions-base', () => ({}));

vi.mock('@memberjunction/actions', () => ({
    BaseAction: class BaseAction {},
}));

import { DataMapperAction } from '../custom/data/data-mapper.action';

declare global {
    // Set only by template code that managed to run JavaScript.
    // eslint-disable-next-line no-var
    var __mjDataMapperEscape: string | undefined;
}

const CODE = `globalThis.__mjDataMapperEscape = 'ran'; return 6*707`;
const ESCAPES = [
    `{{ ''.constructor.constructor("${CODE}")() }}`,
    `{{ name.constructor.constructor("${CODE}")() }}`,
    `{{ range.constructor("${CODE}")() }}`,
];

/** Exposes the protected entry point without weakening its type. */
class TestableDataMapperAction extends DataMapperAction {
    public RunForTest(params: RunActionParams): Promise<ActionResultSimple> {
        return this.InternalRunAction(params);
    }
}

function paramsFor(template: string | Record<string, string>, templateType: string, strict: boolean): RunActionParams {
    const Params = [
        { Name: 'SourceData', Value: { name: 'Ada' }, Type: 'Input' },
        { Name: 'MappingTemplate', Value: template, Type: 'Input' },
        { Name: 'TemplateType', Value: templateType, Type: 'Input' },
        { Name: 'StrictVariables', Value: String(strict), Type: 'Input' },
    ];
    return { Params } as RunActionParams;
}

describe('DataMapperAction: sandboxed environment', () => {
    beforeEach(() => {
        globalThis.__mjDataMapperEscape = undefined;
    });

    it('still maps ordinary templates', async () => {
        const result = await new TestableDataMapperAction().RunForTest(paramsFor('Hello {{ name | upper }}', 'string', false));
        expect(result.Success).toBe(true);
        expect(JSON.stringify(result)).not.toContain('{{');
    });

    it.each(ESCAPES)('refuses a constructor escape in a string template: %s', async (template) => {
        for (const strict of [false, true]) {
            const result = await new TestableDataMapperAction().RunForTest(paramsFor(template, 'string', strict));
            expect(globalThis.__mjDataMapperEscape).toBeUndefined();
            expect(JSON.stringify(result)).not.toContain('4242');
        }
    });

    it.each(ESCAPES)('refuses a constructor escape in an object template: %s', async (template) => {
        for (const strict of [false, true]) {
            const result = await new TestableDataMapperAction().RunForTest(paramsFor({ out: template }, 'object', strict));
            expect(globalThis.__mjDataMapperEscape).toBeUndefined();
            expect(JSON.stringify(result)).not.toContain('4242');
        }
    });
});
