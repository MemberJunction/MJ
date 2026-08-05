/**
 * Minimal, precise type declarations for `prismjs`.
 *
 * `@types/prismjs` is not installed (and pulls in DOM globals we don't want in
 * a React Native context), so we declare only the tiny surface we use:
 * `Prism.tokenize` + `Prism.languages`. The per-language `components/*` modules
 * are pure side-effect imports (they register grammars onto the shared `Prism`
 * object), so they're declared as bodyless ambient modules.
 */
declare module 'prismjs' {
    namespace Prism {
        /** A run of text with a semantic type (e.g. `keyword`, `string`). */
        interface Token {
            type: string;
            content: TokenStream;
            alias: string | string[];
            length: number;
        }

        /** Prism's recursive tokenization output. */
        type TokenStream = string | Token | Array<string | Token>;

        /** A registered language grammar (opaque to us). */
        interface Grammar {
            [key: string]: unknown;
        }

        /** Registered grammars, keyed by language id. */
        const languages: Record<string, Grammar | undefined>;

        /** Tokenize `text` against `grammar` into a flat/nested token stream. */
        function tokenize(text: string, grammar: Grammar): Array<string | Token>;
    }

    export = Prism;
}

declare module 'prismjs/components/prism-typescript';
declare module 'prismjs/components/prism-javascript';
declare module 'prismjs/components/prism-json';
declare module 'prismjs/components/prism-bash';
declare module 'prismjs/components/prism-python';
declare module 'prismjs/components/prism-sql';
declare module 'prismjs/components/prism-markup';
declare module 'prismjs/components/prism-css';
declare module 'prismjs/components/prism-yaml';
