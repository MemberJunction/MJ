/**
 * Scans a component source string for `record.<field>` and
 * `record["<field>"]` references and returns the set of bound field names.
 *
 * Uses the React runtime's already-loaded `@babel/standalone` global if
 * available (it's loaded by the Studio preview pane and most pages that
 * mount an interactive component). Falls back to a regex scan when Babel
 * isn't present — slightly less accurate (misses destructured access and
 * `record[someVar]`) but doesn't block the inspector from rendering.
 *
 * Performance: a typical form component is 200-500 LOC; parsing it takes
 * a few ms. Inspector callers should still debounce on keystroke.
 */

export interface FieldBindingScanResult {
    /** Field names referenced via `record.X` or `record["X"]` patterns. */
    boundFields: Set<string>;
    /** True iff AST parsing succeeded. Regex fallback sets this to false. */
    usedAst: boolean;
    /** Parse error message if AST parsing failed. Useful in dev. */
    parseError?: string;
}

/**
 * Scan code for record-field bindings.
 *
 * @param code The full source of a form-role component.
 * @returns The set of field names referenced. Empty set if `code` is falsy.
 */
export function scanFieldBindings(code: string | null | undefined): FieldBindingScanResult {
    if (!code || code.trim().length === 0) {
        return { boundFields: new Set(), usedAst: false };
    }

    const babel = getBabelStandalone();
    if (babel) {
        try {
            return scanViaBabel(code, babel);
        } catch (err) {
            // Fall through to regex on any parse failure (incomplete JSX,
            // experimental syntax, etc.). The inspector still works; it
            // just shows fewer bindings than the AST would have detected.
            const parseError = err instanceof Error ? err.message : String(err);
            const regexResult = scanViaRegex(code);
            return { ...regexResult, usedAst: false, parseError };
        }
    }

    return scanViaRegex(code);
}

/** Walks the Babel AST for MemberExpression / OptionalMemberExpression nodes. */
function scanViaBabel(code: string, babel: unknown): FieldBindingScanResult {
    const b = babel as BabelStandalone;

    const parser = b.packages?.parser ?? b.parser;
    const traverse = b.packages?.traverse?.default ?? b.packages?.traverse ?? b.traverse;
    if (!parser?.parse || !traverse) {
        // Babel global exists but the sub-packages aren't on the expected
        // shape (older or trimmed builds). Fall back.
        return scanViaRegex(code);
    }

    const ast = parser.parse(code, {
        sourceType: 'module',
        errorRecovery: true,
        plugins: ['jsx'],
    });

    const bound = new Set<string>();

    traverse(ast, {
        // record.FieldName  -> captures FieldName
        // record?.FieldName -> same
        MemberExpression(path: { node: AstNode }) { collectRecordRef(path.node, bound); },
        OptionalMemberExpression(path: { node: AstNode }) { collectRecordRef(path.node, bound); },
    });

    return { boundFields: bound, usedAst: true };
}

/** Examines one Member/OptionalMember node, adds to `bound` if it's a `record.X` pattern. */
function collectRecordRef(node: AstNode, bound: Set<string>): void {
    const obj = node.object;
    if (!obj || obj.type !== 'Identifier' || obj.name !== 'record') {
        return;
    }
    const prop = node.property;
    if (!prop) return;

    if (!node.computed && prop.type === 'Identifier' && prop.name) {
        bound.add(prop.name);
        return;
    }
    if (node.computed && prop.type === 'StringLiteral' && typeof prop.value === 'string') {
        bound.add(prop.value);
    }
    // Dynamic computed access (record[someVar]) is unknowable statically — skip.
}

/** Regex fallback for when Babel isn't available. */
function scanViaRegex(code: string): FieldBindingScanResult {
    const bound = new Set<string>();

    // Strip block + line comments and string literals first so we don't
    // pull "fields" out of comments or string contents. Done as a single
    // pass — simple replacement is good enough for the regex tier.
    const stripped = code
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/[^\n]*/g, '');

    // record.FieldName (and record?.FieldName)
    const dotRe = /\brecord\??\.([A-Za-z_$][A-Za-z0-9_$]*)/g;
    let m: RegExpExecArray | null;
    while ((m = dotRe.exec(stripped)) !== null) {
        bound.add(m[1]);
    }

    // record["FieldName"] (and record?.["FieldName"])
    const bracketRe = /\brecord\??\.?\[\s*["']([^"']+)["']\s*\]/g;
    while ((m = bracketRe.exec(stripped)) !== null) {
        bound.add(m[1]);
    }

    return { boundFields: bound, usedAst: false };
}

/** Pulls Babel-standalone off `window` if it's been loaded by the React runtime. */
function getBabelStandalone(): unknown {
    if (typeof window === 'undefined') return undefined;
    return (window as unknown as { Babel?: unknown }).Babel;
}

interface BabelStandalone {
    packages?: {
        parser?: { parse: (code: string, opts: object) => unknown };
        traverse?: { default?: BabelTraverseFn } & BabelTraverseFn;
    };
    parser?: { parse: (code: string, opts: object) => unknown };
    traverse?: BabelTraverseFn;
}

type BabelTraverseFn = (ast: unknown, visitor: Record<string, (path: { node: AstNode }) => void>) => void;

interface AstNode {
    type: string;
    object?: AstNode;
    property?: AstNode;
    name?: string;
    value?: unknown;
    computed?: boolean;
}
