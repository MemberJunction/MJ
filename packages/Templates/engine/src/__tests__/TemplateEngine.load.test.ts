/**
 * MJAPI loads `@memberjunction/templates` when the server starts, and other packages create their own
 * nunjucks environments in the same process. This file renders nothing and never calls
 * `HardenNunjucksRuntime` itself: it checks that importing the engine module is enough to guard nunjucks.
 */
import { describe, it, expect } from 'vitest';
import nunjucks from 'nunjucks';
import '../TemplateEngine';
import { TemplateSandboxError } from '../TemplateSandboxError';

/** A nunjucks parse-tree node class: the position, then the node's fields in order. */
type NodeClass = new (lineno: number, colno: number, ...fields: unknown[]) => object;

const { parser, runtime, compiler, nodes } = nunjucks as unknown as {
    parser: { parse(src: string): object };
    runtime: {
        makeMacro(argNames: string[], kwargNames: string[], func: (...args: never[]) => unknown): (...args: unknown[]) => unknown;
        makeKeywordArgs(obj: object): object;
    };
    compiler: { Compiler: new (templateName?: string, throwOnUndefined?: boolean) => { compile(node: object): void } };
    nodes: Record<'Root' | 'Output' | 'Dict' | 'Pair' | 'Literal', NodeClass>;
};

/** A parse tree, built by hand, that prints a dictionary with one key. */
function treePrintingDictionary(key: string): object {
    const pair = new nodes.Pair(0, 0, new nodes.Literal(0, 0, key), new nodes.Literal(0, 0, 1));
    return new nodes.Root(0, 0, [new nodes.Output(0, 0, [new nodes.Dict(0, 0, [pair])])]);
}

describe('importing the template engine', () => {
    it('guards the nunjucks parser before anything renders', () => {
        expect(() => parser.parse('{{ a"b }}')).toThrow(TemplateSandboxError);
    });

    it('guards the nunjucks runtime before anything renders', () => {
        const env = new nunjucks.Environment(null, { autoescape: false });
        expect(env.renderString('[{{ range[key] }}][{{ valueOf }}]', { key: 'constructor' })).toBe('[][]');
    });

    it('guards macro arguments, keyword arguments and dictionary keys before anything renders', () => {
        expect(runtime.makeMacro(['valueOf'], [], (value: unknown) => value)()).toBeUndefined();
        expect(() => runtime.makeKeywordArgs(Object.create({ a: 1 }))).toThrow(TemplateSandboxError);
        expect(() => new compiler.Compiler(undefined, false).compile(treePrintingDictionary('toString'))).toThrow(TemplateSandboxError);
    });

    it('guards the environment lookups before anything renders', () => {
        const env = new nunjucks.Environment(null) as unknown as { getFilter(name: string): unknown };
        expect(() => env.getFilter('hasOwnProperty')).toThrow(TemplateSandboxError);
    });
});
