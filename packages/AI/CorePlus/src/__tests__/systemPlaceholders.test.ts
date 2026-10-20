import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    SystemPlaceholderManager,
    DEFAULT_SYSTEM_PLACEHOLDERS,
    SYSTEM_PLACEHOLDER_CATEGORIES
} from '../prompt.system-placeholders';
import type { SystemPlaceholder, AIPromptParams } from '../index';
import type { ChatMessage } from '@memberjunction/ai';

describe('SYSTEM_PLACEHOLDER_CATEGORIES', () => {
    it('should have expected categories', () => {
        const names = SYSTEM_PLACEHOLDER_CATEGORIES.map(c => c.name);

        expect(names).toContain('Date & Time');
        expect(names).toContain('Prompt Metadata');
        expect(names).toContain('User Context');
        expect(names).toContain('Execution Context');
        expect(names).toContain('Environment');
    });

    it('should have icon and color for each category', () => {
        for (const cat of SYSTEM_PLACEHOLDER_CATEGORIES) {
            expect(cat.icon).toBeTruthy();
            expect(cat.color).toBeTruthy();
        }
    });
});

describe('DEFAULT_SYSTEM_PLACEHOLDERS', () => {
    it('should contain date/time placeholders', () => {
        const names = DEFAULT_SYSTEM_PLACEHOLDERS.map(p => p.name);

        expect(names).toContain('_CURRENT_DATE');
        expect(names).toContain('_CURRENT_TIME');
        expect(names).toContain('_CURRENT_DATE_AND_TIME');
        expect(names).toContain('_CURRENT_DAY_OF_WEEK');
        expect(names).toContain('_CURRENT_TIMEZONE');
        expect(names).toContain('_CURRENT_TIMESTAMP_UTC');
    });

    it('should contain prompt metadata placeholders', () => {
        const names = DEFAULT_SYSTEM_PLACEHOLDERS.map(p => p.name);

        expect(names).toContain('_OUTPUT_EXAMPLE');
        expect(names).toContain('_PROMPT_NAME');
        expect(names).toContain('_PROMPT_DESCRIPTION');
    });

    it('should contain user context placeholders', () => {
        const names = DEFAULT_SYSTEM_PLACEHOLDERS.map(p => p.name);

        expect(names).toContain('_USER_NAME');
        expect(names).toContain('_USER_EMAIL');
        expect(names).toContain('_USER_ID');
    });

    it('should contain execution context placeholders', () => {
        const names = DEFAULT_SYSTEM_PLACEHOLDERS.map(p => p.name);

        expect(names).toContain('_MODEL_ID');
        expect(names).toContain('_VENDOR_ID');
        expect(names).toContain('_CONVERSATION_LENGTH');
    });
});

describe('SystemPlaceholderManager', () => {
    beforeEach(() => {
        SystemPlaceholderManager.resetToDefaults();
    });

    describe('getPlaceholders', () => {
        it('should return the list of placeholders', () => {
            const placeholders = SystemPlaceholderManager.getPlaceholders();

            expect(placeholders.length).toBeGreaterThan(0);
            expect(placeholders.length).toBe(DEFAULT_SYSTEM_PLACEHOLDERS.length);
        });
    });

    describe('getPlaceholder', () => {
        it('should find a placeholder by name', () => {
            const placeholder = SystemPlaceholderManager.getPlaceholder('_CURRENT_DATE');

            expect(placeholder).toBeDefined();
            expect(placeholder!.name).toBe('_CURRENT_DATE');
        });

        it('should return undefined for unknown name', () => {
            expect(SystemPlaceholderManager.getPlaceholder('_NONEXISTENT')).toBeUndefined();
        });
    });

    describe('addPlaceholder', () => {
        it('should add a new placeholder', () => {
            const custom: SystemPlaceholder = {
                name: '_CUSTOM_TEST',
                description: 'Test placeholder',
                getValue: async () => 'custom-value'
            };

            SystemPlaceholderManager.addPlaceholder(custom);

            const found = SystemPlaceholderManager.getPlaceholder('_CUSTOM_TEST');
            expect(found).toBeDefined();
            expect(found!.description).toBe('Test placeholder');
        });

        it('should throw for duplicate name', () => {
            expect(() => {
                SystemPlaceholderManager.addPlaceholder({
                    name: '_CURRENT_DATE',
                    getValue: async () => 'duplicate'
                });
            }).toThrow("System placeholder '_CURRENT_DATE' already exists");
        });
    });

    describe('removePlaceholder', () => {
        it('should remove an existing placeholder', () => {
            const result = SystemPlaceholderManager.removePlaceholder('_CURRENT_DATE');

            expect(result).toBe(true);
            expect(SystemPlaceholderManager.getPlaceholder('_CURRENT_DATE')).toBeUndefined();
        });

        it('should return false for non-existent placeholder', () => {
            expect(SystemPlaceholderManager.removePlaceholder('_NONEXISTENT')).toBe(false);
        });
    });

    describe('resetToDefaults', () => {
        it('should restore defaults after modifications', () => {
            SystemPlaceholderManager.removePlaceholder('_CURRENT_DATE');
            SystemPlaceholderManager.addPlaceholder({
                name: '_EXTRA',
                getValue: async () => 'extra'
            });

            SystemPlaceholderManager.resetToDefaults();

            expect(SystemPlaceholderManager.getPlaceholder('_CURRENT_DATE')).toBeDefined();
            expect(SystemPlaceholderManager.getPlaceholder('_EXTRA')).toBeUndefined();
            expect(SystemPlaceholderManager.getPlaceholders().length).toBe(DEFAULT_SYSTEM_PLACEHOLDERS.length);
        });
    });

    describe('resolveAllPlaceholders', () => {
        it('should resolve all placeholders to string values', async () => {
            const mockParams = {
                prompt: { Name: 'Test Prompt', Description: 'A test', OutputExample: 'example', OutputType: 'string', ResponseFormat: 'Any' },
                contextUser: { ID: 'u1', Name: 'Test User', Email: 'test@test.com' }
            } as unknown as import('../prompt.types').AIPromptParams;

            const resolved = await SystemPlaceholderManager.resolveAllPlaceholders(mockParams);

            expect(typeof resolved._CURRENT_DATE).toBe('string');
            expect(resolved._CURRENT_DATE).toMatch(/^\d{4}-\d{2}-\d{2}$/);
            expect(resolved._PROMPT_NAME).toBe('Test Prompt');
            expect(resolved._USER_NAME).toBe('Test User');
            expect(resolved._USER_EMAIL).toBe('test@test.com');
        });

        it('should handle errors in placeholder resolution gracefully', async () => {
            const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            SystemPlaceholderManager.addPlaceholder({
                name: '_ERROR_PLACEHOLDER',
                getValue: async () => { throw new Error('oops'); }
            });

            const mockParams = {
                prompt: {},
                contextUser: {}
            } as unknown as import('../prompt.types').AIPromptParams;

            const resolved = await SystemPlaceholderManager.resolveAllPlaceholders(mockParams);

            expect(resolved._ERROR_PLACEHOLDER).toBe('');
            errorSpy.mockRestore();
        });

        it('should resolve _USER_NAME from FirstName/LastName when Name is absent', async () => {
            const mockParams = {
                prompt: {},
                contextUser: { FirstName: 'John', LastName: 'Doe' }
            } as unknown as import('../prompt.types').AIPromptParams;

            const resolved = await SystemPlaceholderManager.resolveAllPlaceholders(mockParams);

            expect(resolved._USER_NAME).toBe('John Doe');
        });

        it('should resolve _USER_NAME to Unknown User when no context user', async () => {
            const mockParams = {
                prompt: {},
                contextUser: undefined
            } as unknown as import('../prompt.types').AIPromptParams;

            const resolved = await SystemPlaceholderManager.resolveAllPlaceholders(mockParams);

            expect(resolved._USER_NAME).toBe('Unknown User');
        });

        it('should resolve _ENVIRONMENT from NODE_ENV', async () => {
            const original = process.env.NODE_ENV;
            process.env.NODE_ENV = 'test';

            const mockParams = {
                prompt: {},
            } as unknown as import('../prompt.types').AIPromptParams;

            const resolved = await SystemPlaceholderManager.resolveAllPlaceholders(mockParams);

            expect(resolved._ENVIRONMENT).toBe('test');
            process.env.NODE_ENV = original;
        });

        it('should resolve conversation context placeholders', async () => {
            const mockParams = {
                prompt: {},
                conversationMessages: [{ role: 'user', content: 'Hello' }, { role: 'assistant', content: 'Hi' }]
            } as unknown as import('../prompt.types').AIPromptParams;

            const resolved = await SystemPlaceholderManager.resolveAllPlaceholders(mockParams);

            expect(resolved._HAS_CONVERSATION_CONTEXT).toBe('true');
            expect(resolved._CONVERSATION_LENGTH).toBe('2');
        });
    });
});

describe('SystemPlaceholderManager.ReplaceAvailablePlaceholders', () => {
    beforeEach(() => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date(2026, 9, 14, 12));
    });
    afterEach(() => {
        vi.useRealTimers();
        SystemPlaceholderManager.resetToDefaults();
    });

    const sys = (content: string): ChatMessage => ({ role: 'system', content });
    const replace = (messages: ChatMessage[], params: Partial<AIPromptParams> = {}) =>
        SystemPlaceholderManager.ReplaceAvailablePlaceholders(messages, params);
    const user = { Name: 'Ada', Email: 'ada@example.com' } as unknown as AIPromptParams['contextUser'];

    it('replaces a token in every message with the same value', async () => {
        const out = await replace([sys('Today is {{ _CURRENT_DATE }}.'), { role: 'user', content: 'Since {{_CURRENT_DATE}}' }]);
        expect(out.map(m => m.content)).toEqual(['Today is 2026-10-14.', 'Since 2026-10-14']);
        expect(out[1].role).toBe('user');
    });

    it('sends everything except bare tokens exactly as written', async () => {
        const literal = "{{name}} {{ source.title }} {{ items[0] }} {{ a + b }} {{ _CURRENT_DATE | upper }} " +
            "{% if not sources %}none{% endif %} {{ title | default('x') }} {% for i in range(3) %}{% endfor %} " +
            "\\frac{{a}}{b} {# note #} {{#each items}} {{{ _CURRENT_DATE }}} {{ constructor }} Acme & Co <b>";
        const [out] = await replace([sys(`${literal} {{ _CURRENT_DATE }}`)]);
        expect(out.content).toBe(`${literal} 2026-10-14`);
    });

    it('resolves user tokens only with a contextUser, and never prompt or execution tokens without them', async () => {
        const text = '{{ _USER_NAME }} {{ _PROMPT_NAME }} {{ _MODEL_ID }}';
        expect((await replace([sys(text)]))[0].content).toBe(text);
        expect((await replace([sys(text)], { contextUser: user }))[0].content).toBe('Ada {{ _PROMPT_NAME }} {{ _MODEL_ID }}');
    });

    it('leaves block content alone', async () => {
        const blocks: ChatMessage = { role: 'user', content: [{ type: 'text', content: '{{ _CURRENT_DATE }}' }] } as unknown as ChatMessage;
        const out = await replace([blocks, sys('{{ _CURRENT_DATE }}')]);
        expect(out[0]).toBe(blocks);
        expect(out[1].content).toBe('2026-10-14');
    });

    it('runs only the placeholders the text names, and returns the input when it names none', async () => {
        const other = vi.fn(async () => 'x');
        SystemPlaceholderManager.addPlaceholder({ name: '_OTHER', requires: [], getValue: other });
        await replace([sys('{{ _CURRENT_DATE }}')]);
        expect(other).not.toHaveBeenCalled();
        const input = [sys('{{name}} and no placeholder')];
        expect(await replace(input)).toBe(input);
    });

    it('keeps the token of a placeholder that fails, returns nothing, or does not declare requires', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        SystemPlaceholderManager.addPlaceholder({ name: '_BROKEN', requires: [], getValue: async () => { throw new Error('no'); } });
        SystemPlaceholderManager.addPlaceholder({ name: '_EMPTY', requires: ['contextUser'], getValue: async () => undefined as unknown as string });
        SystemPlaceholderManager.addPlaceholder({ name: '_TURN_COUNT', getValue: async (p) => String(p.conversationMessages?.length || 0) });
        const [out] = await replace([sys('{{ _BROKEN }} {{ _EMPTY }} {{ _TURN_COUNT }} {{ _CURRENT_DATE }}')], { contextUser: user });
        expect(out.content).toBe('{{ _BROKEN }} {{ _EMPTY }} {{ _TURN_COUNT }} 2026-10-14');
    });
});
