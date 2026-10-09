/**
 * MJAPI loads `@memberjunction/templates` when the server starts, and other packages create their own
 * nunjucks environments in the same process. This file renders nothing and never calls
 * `HardenNunjucksRuntime` itself: it checks that importing the engine module is enough to guard nunjucks.
 */
import { describe, it, expect } from 'vitest';
import nunjucks from 'nunjucks';
import '../TemplateEngine';
import { TemplateSandboxError } from '../TemplateSandboxError';

const { parser } = nunjucks as unknown as { parser: { parse(src: string): object } };

describe('importing the template engine', () => {
    it('guards the nunjucks parser before anything renders', () => {
        expect(() => parser.parse('{{ a"b }}')).toThrow(TemplateSandboxError);
    });

    it('guards the nunjucks runtime before anything renders', () => {
        const env = new nunjucks.Environment(null, { autoescape: false });
        expect(env.renderString('[{{ range.constructor }}][{{ valueOf }}]', {})).toBe('[][]');
    });
});
