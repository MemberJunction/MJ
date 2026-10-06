/**
 * Assistant-prefill fallback — `$` in the prefill text (issue #3171).
 *
 * When a provider has no native prefill support, the configured prefill is
 * spliced into a fallback instruction template and appended to the system
 * message. Prefill text is authored content and routinely contains `$` — LaTeX
 * (`$$…$$`), currency, JSON fragments — so as a *string* replacement `$$`, `$&`,
 * `` $` `` and `$'` in it were expanded rather than inserted, steering the model
 * with an instruction that differs from what the author wrote.
 *
 * `resolveSupportsPrefill` and `resolvePrefillFallbackText` are stubbed: their
 * cascades are a separate concern, and stubbing them isolates the substitution
 * actually under test.
 *
 * NOTE: the identical expression appears a second time in `createPromptRun`,
 * which writes to the database and is not isolable here. It is the same one-line
 * shape, verified by inspection rather than execution.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { AIPromptRunner } from '../AIPromptRunner';
import { ChatMessageRole } from '@memberjunction/ai';

/** `$` before an ordinary character is NOT special — that case must keep working. */
const HOSTILE = ['a$$b', 'a$&b', 'a$`b', "a$'b", 'a$1b', 'a$b', "x$&$`$'$$y"];

const TEMPLATE = 'BEGIN>>{{prefill}}<<END';

type ChatParamsLike = { messages: Array<{ role: unknown; content: unknown }> };

describe('applyAssistantPrefill — $ in prefill text (#3171)', () => {
    let runner: AIPromptRunner;

    /** Drives the real private method with the two cascades stubbed out. */
    const apply = (prefill: string, existingSystem?: string): ChatParamsLike => {
        const priv = runner as unknown as Record<string, unknown>;
        priv.resolveSupportsPrefill = () => false; // force the fallback branch
        priv.resolvePrefillFallbackText = () => TEMPLATE;

        const chatParams: ChatParamsLike = {
            messages: existingSystem
                ? [{ role: ChatMessageRole.system, content: existingSystem }]
                : [],
        };
        (priv.applyAssistantPrefill as (...a: unknown[]) => void)(
            chatParams,
            { AssistantPrefill: prefill, PrefillFallbackMode: 'SystemInstruction' },
            { ModelVendors: [] },
            null,
            {},
        );
        return chatParams;
    };

    beforeEach(() => {
        runner = new AIPromptRunner();
    });

    for (const value of HOSTILE) {
        it(`injects a prefill containing ${JSON.stringify(value)} verbatim`, () => {
            const { messages } = apply(value);
            expect(messages).toHaveLength(1);
            expect(messages[0].content).toBe(`BEGIN>>${value}<<END`);
        });

        it(`appends a prefill containing ${JSON.stringify(value)} to an existing system message`, () => {
            const { messages } = apply(value, 'SYS');
            expect(messages[0].content).toBe(`SYS\n\nBEGIN>>${value}<<END`);
        });
    }

    it('does nothing when no prefill is configured', () => {
        const { messages } = apply('');
        expect(messages).toHaveLength(0);
    });

    it('handles a LaTeX-style prefill, the realistic carrier of $$', () => {
        const { messages } = apply('Answer with $$x^2$$ notation');
        expect(messages[0].content).toBe('BEGIN>>Answer with $$x^2$$ notation<<END');
    });
});
