import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { DEFAULT_CONTROLLER_PROMPT } from '../prompts/default-controller.js';
import { DEFAULT_JUDGE_PROMPT } from '../prompts/default-judge.js';
import {
    CONTROLLER_ACTIONS,
    CONTROLLER_RESPONSE_FORMAT,
    JUDGE_CORE,
} from '../prompts/prompt-parts.generated.js';

/**
 * Drift-guard for the Computer Use single-source-of-truth design.
 *
 * The shared behavioral text lives ONCE in the leaf partials under
 * metadata/prompts/templates/computer-use/_includes/. It is consumed by:
 *  - Layer 2 (metadata templates) via {@include ./_includes/...}
 *  - Layer 1 (this package's default prompts) via prompt-parts.generated.ts
 *
 * These tests assert that the partials on disk are carried verbatim into both
 * the generated consts AND the composed DEFAULT_* prompts, and that the
 * metadata templates reference each partial via {@include}. If either layer
 * silently diverges from the partials, one of these assertions fails.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// src/__tests__/ → repo root is 5 levels up.
const INCLUDES_DIR = join(__dirname, '../../../../../metadata/prompts/templates/computer-use/_includes');
const TEMPLATES_DIR = join(__dirname, '../../../../../metadata/prompts/templates/computer-use');

/**
 * Read a partial with the same trailing-newline trim the generator applies,
 * so its content matches the generated const exactly.
 */
function readPartial(fileName: string): string {
    return readFileSync(join(INCLUDES_DIR, fileName), 'utf8').replace(/\n+$/, '');
}

function readTemplate(fileName: string): string {
    return readFileSync(join(TEMPLATES_DIR, fileName), 'utf8');
}

interface PartialCase {
    file: string;
    generatedConst: string;
    template: string;
    composedPrompt: string;
}

const cases: PartialCase[] = [
    {
        file: 'controller-actions.md',
        generatedConst: CONTROLLER_ACTIONS,
        template: 'controller.template.md',
        composedPrompt: DEFAULT_CONTROLLER_PROMPT,
    },
    {
        file: 'controller-response-format.md',
        generatedConst: CONTROLLER_RESPONSE_FORMAT,
        template: 'controller.template.md',
        composedPrompt: DEFAULT_CONTROLLER_PROMPT,
    },
    {
        file: 'judge-core.md',
        generatedConst: JUDGE_CORE,
        template: 'judge.template.md',
        composedPrompt: DEFAULT_JUDGE_PROMPT,
    },
];

describe('Computer Use prompt single-source-of-truth', () => {
    describe.each(cases)('partial $file', ({ file, generatedConst, template, composedPrompt }) => {
        it('matches its generated const exactly', () => {
            expect(generatedConst).toBe(readPartial(file));
        });

        it('appears verbatim in the generated const', () => {
            expect(generatedConst).toContain(readPartial(file));
        });

        it('appears verbatim in the composed default prompt', () => {
            expect(composedPrompt).toContain(readPartial(file));
        });

        it(`is referenced via {@include} in ${template}`, () => {
            expect(readTemplate(template)).toContain(`{@include ./_includes/${file}}`);
        });
    });
});
