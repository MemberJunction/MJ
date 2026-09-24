/**
 * Prompt rendering — `$` in substituted values (issue #3171).
 *
 * `renderControllerPrompt` and `renderJudgePrompt` splice runtime data (the
 * user's goal, the current URL, the rendered dynamic sections, the step summary)
 * into a prompt template. Passing that data as a *string* replacement made
 * `String.prototype.replace` expand `$$`, `$&`, `` $` `` and `$'` inside it —
 * silently steering the model with a prompt that differs from the data under
 * test, and in the `$&`/`` $` ``/`$'` cases splicing the template's own text into
 * the value. Both methods now use replacement functions.
 *
 * These paths shipped with no test of their own; the conversion is verified here
 * by driving the real private methods over the real template.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ComputerUseEngine } from '../engine/ComputerUseEngine.js';
import { ControllerPromptRequest, JudgePromptRequest } from '../types/controller.js';
import type { RunComputerUseParams } from '../types/params.js';

/** `$` before an ordinary character is NOT special — that case must keep working too. */
const HOSTILE = ['a$$b', 'a$&b', 'a$`b', "a$'b", 'a$1b', 'a$b', "x$&$`$'$$y"];

describe('ComputerUseEngine prompt rendering — $ in substituted values (#3171)', () => {
    let engine: ComputerUseEngine;

    /** Reaches the private renderers without changing their visibility. */
    const render = (method: string, request: unknown): string =>
        (engine as unknown as Record<string, (r: unknown) => string>)[method](request);

    /** Pins the templates so the assertions describe substitution, not the defaults. */
    const useTemplates = (controller: string, judge: string): void => {
        (engine as unknown as { activeParams?: Partial<RunComputerUseParams> }).activeParams = {
            ControllerPrompt: controller,
            JudgePrompt: judge,
        } as Partial<RunComputerUseParams> as RunComputerUseParams;
    };

    beforeEach(() => {
        engine = new ComputerUseEngine();
    });

    describe('renderControllerPrompt', () => {
        for (const value of HOSTILE) {
            it(`substitutes a goal containing ${JSON.stringify(value)} verbatim`, () => {
                useTemplates('GOAL[{{goal}}] URL[{{currentUrl}}]', '');
                const request = new ControllerPromptRequest();
                request.Goal = value;
                request.CurrentUrl = 'https://example.test/';

                expect(render('renderControllerPrompt', request))
                    .toBe(`GOAL[${value}] URL[https://example.test/]`);
            });

            it(`substitutes a currentUrl containing ${JSON.stringify(value)} verbatim`, () => {
                useTemplates('GOAL[{{goal}}] URL[{{currentUrl}}]', '');
                const request = new ControllerPromptRequest();
                request.Goal = 'sign in';
                request.CurrentUrl = `https://example.test/?q=${value}`;

                expect(render('renderControllerPrompt', request))
                    .toBe(`GOAL[sign in] URL[https://example.test/?q=${value}]`);
            });
        }

        it('substitutes the rendered dynamic sections verbatim when they contain $', () => {
            // ApplicationContext is free-form markdown supplied per suite, so it is
            // the realistic carrier of a `$` into the dynamicSections block.
            useTemplates('<<{{dynamicSections}}>>', '');
            const request = new ControllerPromptRequest();
            request.ApplicationContext = 'Prices look like $$12.50 and $& is literal';

            const out = render('renderControllerPrompt', request);
            expect(out).toContain('$$12.50');
            expect(out).toContain('$& is literal');
        });

        it('renders step numbers without disturbing the surrounding template', () => {
            useTemplates('{{stepNumber}}/{{maxSteps}}', '');
            const request = new ControllerPromptRequest();
            request.StepNumber = 3;
            request.MaxSteps = 10;

            expect(render('renderControllerPrompt', request)).toBe('3/10');
        });

        it('maps every token to its own value', () => {
            useTemplates('g={{goal}} s={{stepNumber}} m={{maxSteps}} u={{currentUrl}}', '');
            const request = new ControllerPromptRequest();
            request.Goal = 'G';
            request.StepNumber = 1;
            request.MaxSteps = 2;
            request.CurrentUrl = 'U';

            expect(render('renderControllerPrompt', request)).toBe('g=G s=1 m=2 u=U');
        });
    });

    describe('renderJudgePrompt', () => {
        for (const value of HOSTILE) {
            it(`substitutes a step summary containing ${JSON.stringify(value)} verbatim`, () => {
                useTemplates('', 'SUMMARY[{{stepSummary}}] GOAL[{{goal}}]');
                const request = new JudgePromptRequest();
                request.StepSummary = value;
                request.Goal = 'complete checkout';

                expect(render('renderJudgePrompt', request))
                    .toBe(`SUMMARY[${value}] GOAL[complete checkout]`);
            });
        }

        it('maps every token to its own value', () => {
            useTemplates('', 'g={{goal}} s={{stepNumber}} m={{maxSteps}} u={{currentUrl}} y={{stepSummary}}');
            const request = new JudgePromptRequest();
            request.Goal = 'G';
            request.StepNumber = 4;
            request.MaxSteps = 9;
            request.CurrentUrl = 'U';
            request.StepSummary = 'Y';

            expect(render('renderJudgePrompt', request)).toBe('g=G s=4 m=9 u=U y=Y');
        });
    });
});
