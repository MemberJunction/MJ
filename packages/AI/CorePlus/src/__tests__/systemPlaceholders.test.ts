import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    SystemPlaceholderManager,
    DEFAULT_SYSTEM_PLACEHOLDERS,
    SYSTEM_PLACEHOLDER_CATEGORIES
} from '../prompt.system-placeholders';
import type { SystemPlaceholder, AIPromptParams } from '../index';

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
        expect(names).toContain('_AGENT_RUN_ID');
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
