import { describe, expect, it } from 'vitest';
import { DEFAULT_SYSTEM_PLACEHOLDERS } from '@memberjunction/ai-core-plus';
import {
    DetectVolatilePlaceholders,
    IsVolatileChildPrompt,
    ResolveSpecializationPlacement,
    ResolveSpecializationPlacementParam,
    VOLATILE_PLACEHOLDER_NAMES,
} from '../volatile-child-prompt';

const STATIC = '# Sage\n\n## Role\n- Your name is Sage\n- You operate like a skilled concierge.';
const DATED = `${STATIC}\n\nCurrent date/time: {{ _CURRENT_DATE_AND_TIME }}`;
const PAYLOADED = `${STATIC}\n\n## Working state\n{{ _CURRENT_PAYLOAD | dump }}`;
const TRAILING: Record<string, unknown> = { volatileStatePlacement: 'trailingMessage' };

describe('VOLATILE_PLACEHOLDER_NAMES', () => {
    it('covers every Date & Time system placeholder except the stable timezone', () => {
        const temporal = DEFAULT_SYSTEM_PLACEHOLDERS.filter(p => p.category === 'Date & Time').map(p => p.name);
        for (const name of temporal) {
            if (name === '_CURRENT_TIMEZONE') expect(VOLATILE_PLACEHOLDER_NAMES).not.toContain(name);
            else expect(VOLATILE_PLACEHOLDER_NAMES).toContain(name);
        }
    });

    it('includes the loop agent\'s per-iteration variables', () => {
        for (const v of ['_CURRENT_PAYLOAD', '_SCRATCHPAD_NOTES', '_SCRATCHPAD_TASKS', '_SCRATCHPAD_TASK_SUMMARY']) {
            expect(VOLATILE_PLACEHOLDER_NAMES).toContain(v);
        }
    });

    it('does not include per-run-stable placeholders', () => {
        for (const v of ['_USER_NAME', '_ENVIRONMENT', '_PROMPT_NAME', '_CURRENT_TIMEZONE']) {
            expect(VOLATILE_PLACEHOLDER_NAMES).not.toContain(v);
        }
    });
});

describe('DetectVolatilePlaceholders', () => {
    it('returns nothing for a static template, empty text, or null', () => {
        expect(DetectVolatilePlaceholders(STATIC)).toEqual([]);
        expect(DetectVolatilePlaceholders('')).toEqual([]);
        expect(DetectVolatilePlaceholders(null)).toEqual([]);
        expect(DetectVolatilePlaceholders(undefined)).toEqual([]);
    });

    it('reports each referenced volatile name once', () => {
        expect(DetectVolatilePlaceholders(DATED)).toEqual(['_CURRENT_DATE_AND_TIME']);
        expect(DetectVolatilePlaceholders(PAYLOADED)).toEqual(['_CURRENT_PAYLOAD']);
        expect(DetectVolatilePlaceholders(`${DATED}\n{{ _CURRENT_PAYLOAD }} {{ _CURRENT_PAYLOAD }}`)).toEqual(['_CURRENT_DATE_AND_TIME', '_CURRENT_PAYLOAD']);
    });

    it('matches whole identifiers only', () => {
        // _CURRENT_DATE is a prefix of _CURRENT_DATE_AND_TIME; only the latter is present here.
        expect(DetectVolatilePlaceholders('{{ _CURRENT_DATE_AND_TIME }}')).toEqual(['_CURRENT_DATE_AND_TIME']);
        // A made-up longer identifier must not trigger the shorter name.
        expect(DetectVolatilePlaceholders('{{ _CURRENT_DATEX }}')).toEqual([]);
        expect(DetectVolatilePlaceholders('{{ MY_CURRENT_DATE }}')).toEqual([]);
    });

    it('matches regardless of Nunjucks spacing or filters', () => {
        expect(IsVolatileChildPrompt('{{_CURRENT_TIME}}')).toBe(true);
        expect(IsVolatileChildPrompt('{{ _SCRATCHPAD_NOTES | safe }}')).toBe(true);
        expect(IsVolatileChildPrompt('{% if _CURRENT_DAY_OF_WEEK == "Monday" %}x{% endif %}')).toBe(true);
    });
});

describe('ResolveSpecializationPlacementParam', () => {
    it('defaults to auto and fails closed on garbage', () => {
        expect(ResolveSpecializationPlacementParam(undefined)).toBe('auto');
        expect(ResolveSpecializationPlacementParam({})).toBe('auto');
        expect(ResolveSpecializationPlacementParam({ specializationPlacement: 'Auto' })).toBe('auto');
        expect(ResolveSpecializationPlacementParam({ specializationPlacement: true })).toBe('auto');
        expect(ResolveSpecializationPlacementParam({ specializationPlacement: 'trailingMessage' })).toBe('trailingMessage');
        expect(ResolveSpecializationPlacementParam({ specializationPlacement: 'systemPrompt' })).toBe('systemPrompt');
    });
});

describe('ResolveSpecializationPlacement', () => {
    it('never relocates under systemPrompt runtime-state placement, whatever else is set', () => {
        expect(ResolveSpecializationPlacement({ volatileStatePlacement: 'systemPrompt' }, DATED)).toBe('systemPrompt');
        expect(ResolveSpecializationPlacement({ volatileStatePlacement: 'systemPrompt', specializationPlacement: 'trailingMessage' }, DATED)).toBe('systemPrompt');
    });

    it('defaults to relocating volatile child prompts under default trailing placement', () => {
        expect(ResolveSpecializationPlacement(undefined, DATED)).toBe('trailingMessage');
        expect(ResolveSpecializationPlacement(undefined, STATIC)).toBe('systemPrompt');
    });

    it('never relocates when there is no child prompt', () => {
        expect(ResolveSpecializationPlacement({ ...TRAILING, specializationPlacement: 'trailingMessage' }, null)).toBe('systemPrompt');
        expect(ResolveSpecializationPlacement(TRAILING, '')).toBe('systemPrompt');
    });

    it('auto: relocates exactly when the child template is volatile', () => {
        expect(ResolveSpecializationPlacement(TRAILING, STATIC)).toBe('systemPrompt');
        expect(ResolveSpecializationPlacement(TRAILING, DATED)).toBe('trailingMessage');
        expect(ResolveSpecializationPlacement(TRAILING, PAYLOADED)).toBe('trailingMessage');
        expect(ResolveSpecializationPlacement({ ...TRAILING, specializationPlacement: 'auto' }, DATED)).toBe('trailingMessage');
    });

    it('an explicit choice overrides auto in both directions', () => {
        expect(ResolveSpecializationPlacement({ ...TRAILING, specializationPlacement: 'systemPrompt' }, DATED)).toBe('systemPrompt');
        expect(ResolveSpecializationPlacement({ ...TRAILING, specializationPlacement: 'trailingMessage' }, STATIC)).toBe('trailingMessage');
    });
});
