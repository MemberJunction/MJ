/**
 * PromptEngine renders prompt files from a directory the operator points it at. Its nunjucks
 * environment is built sandboxed by the class itself; nothing here loads `@memberjunction/templates`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const prompts = vi.hoisted(() => ({ sent: [] as string[] }));

vi.mock('../utils/llm-factory.js', () => ({
    CreateLLMInstance: () => ({
        ChatCompletion: async (params: { messages: Array<{ content: string }> }) => {
            prompts.sent.push(...params.messages.map(m => String(m.content)));
            return { success: false, errorMessage: 'stub', data: null };
        },
    }),
}));

import { PromptEngine } from '../prompts/PromptEngine';

declare global {
    // Set only by template code that managed to run JavaScript.
    // eslint-disable-next-line no-var
    var __mjPromptEngineEscape: string | undefined;
}

type EngineConfig = ConstructorParameters<typeof PromptEngine>[0];

const CODE = `globalThis.__mjPromptEngineEscape = 'ran'; return 6*707`;

describe('PromptEngine: sandboxed environment', () => {
    let directory: string;

    beforeEach(async () => {
        directory = await mkdtemp(join(tmpdir(), 'mj-dbautodoc-prompts-'));
        prompts.sent.length = 0;
        globalThis.__mjPromptEngineEscape = undefined;
        // A render failure ends the process in production; here it only has to be observable.
        vi.spyOn(process, 'exit').mockImplementation((() => undefined) as unknown as typeof process.exit);
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(async () => {
        await rm(directory, { recursive: true, force: true });
    });

    async function engineWith(files: Record<string, string>): Promise<PromptEngine> {
        for (const [name, content] of Object.entries(files)) {
            await writeFile(join(directory, `${name}.md`), content, 'utf-8');
        }
        const config = { provider: 'stub', apiKey: 'none', model: 'stub', maxTokens: 10 } as unknown as EngineConfig;
        const engine = new PromptEngine(config, directory);
        await engine.Initialize();
        return engine;
    }

    it('still renders an ordinary prompt file', async () => {
        const engine = await engineWith({ plain: 'Describe {{ table | upper }} ({{ columns | join(", ") }})' });
        await engine.ExecutePrompt('plain', { table: 'orders', columns: ['a', 'b'] });
        expect(process.exit).not.toHaveBeenCalled();
        expect(prompts.sent.some(p => p.includes('Describe ORDERS (a, b)'))).toBe(true);
    });

    it.each([
        `{{ ''.constructor.constructor("${CODE}")() }}`,
        `{{ range.constructor("${CODE}")() }}`,
        `{{ table.constructor.constructor("${CODE}")() }}`,
    ])('refuses a constructor escape in a prompt file: %s', async (template) => {
        const engine = await engineWith({ escape: template });
        await engine.ExecutePrompt('escape', { table: 'orders' });
        expect(globalThis.__mjPromptEngineEscape).toBeUndefined();
        expect(prompts.sent.join('\n')).not.toContain('4242');
    });
});
