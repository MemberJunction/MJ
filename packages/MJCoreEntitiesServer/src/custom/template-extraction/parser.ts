// ═══════════════════════════════════════════════════
// Deterministic Nunjucks template parameter extraction via AST walking.
//
// Parses the template text with nunjucks.parser.parse(), walks the AST,
// and extracts all template parameters with inferred types, required-ness,
// default values, and property schemas.
// ═══════════════════════════════════════════════════

import nunjucks from 'nunjucks';
import type { DeterministicParameter, ParameterUsage, ParseResult, PropertyAccess, TemplateParamType } from './types';

// The nunjucks parser API is publicly available at runtime but not declared in @types/nunjucks.
// Access it via the module's actual exports.
const nunjucksParser = (nunjucks as unknown as { parser: { parse: (src: string) => ASTNode } }).parser;

// ─── Nunjucks AST node interface ─────────────────────────────────────────────
// Nunjucks doesn't export typed AST nodes. We define a minimal interface
// covering the properties we need from each node type.
interface ASTNode {
    typename: string;
    lineno: number;
    colno: number;
    value?: string | number | boolean;
    children?: ASTNode[];
    body?: ASTNode;
    else_?: ASTNode;
    cond?: ASTNode;
    target?: ASTNode;
    targets?: ASTNode[];
    val?: ASTNode;
    arr?: ASTNode;
    name?: ASTNode | string; // Symbol for For name; string for Filter name
    args?: ASTNode;
    left?: ASTNode;
    right?: ASTNode;
    expr?: ASTNode;
    ops?: Array<{ type: string; expr: ASTNode }>;
    contentArgs?: ASTNode[];
}

// ─── Scope tracking ─────────────────────────────────────────────────────────
/**
 * Tracks local variables introduced by {% for %}, {% set %}, and {% macro %}.
 * Uses a stack so nested scopes properly shadow outer scopes.
 */
interface Scope {
    /** Variable names defined in this scope (loop vars, set vars, macro args) */
    locals: Set<string>;
}

// ─── Internal accumulator for a single parameter ────────────────────────────
interface ParamAccumulator {
    name: string;
    types: Set<TemplateParamType>;
    usedUnconditionally: boolean;
    defaultValue: string | null;
    filters: Set<string>;
    properties: Map<string, PropAccumulator>;
    usages: ParameterUsage[];
}

interface PropAccumulator {
    name: string;
    types: Set<TemplateParamType>;
    usedUnconditionally: boolean;
    children: Map<string, PropAccumulator>;
}

/**
 * Parse a Nunjucks template and deterministically extract all template parameters.
 *
 * @param templateText The raw Nunjucks template string
 * @returns ParseResult with extracted parameters and any warnings
 */
export function ParseTemplateParameters(templateText: string): ParseResult {
    const warnings: string[] = [];

    // Handle null/empty input
    if (!templateText || templateText.trim().length === 0) {
        return { parameters: [], warnings: [] };
    }

    // Strip MJ-specific {@include ...} directives before parsing — Nunjucks doesn't understand them
    const cleanedText = stripIncludeDirectives(templateText);

    let ast: ASTNode;
    try {
        ast = nunjucksParser.parse(cleanedText) as ASTNode;
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        warnings.push(`Nunjucks parse error: ${msg}`);
        return { parameters: [], warnings };
    }

    const walker = new ASTWalker();
    walker.walk(ast);

    const parameters = walker.buildParameters();
    return { parameters, warnings };
}

/**
 * Remove {@include ...} directives which are MJ-specific and would cause parse errors.
 */
function stripIncludeDirectives(text: string): string {
    return text.replace(/\{@include\s+[^}]+\}/g, '');
}

// ═══════════════════════════════════════════════════
// AST Walker
// ═══════════════════════════════════════════════════

class ASTWalker {
    private params = new Map<string, ParamAccumulator>();
    private scopeStack: Scope[] = [{ locals: new Set() }];
    /** Tracks how deep we are inside conditionals that guard a specific variable */
    private conditionalDepth = 0;
    /** Set of parameter names that are currently being guarded by a conditional */
    private guardedParams = new Set<string>();

    walk(node: ASTNode): void {
        if (!node) return;
        const handler = this.handlers[node.typename];
        if (handler) {
            handler.call(this, node);
        } else {
            this.walkChildren(node);
        }
    }

    /**
     * Build final DeterministicParameter[] from accumulated data.
     */
    buildParameters(): DeterministicParameter[] {
        const result: DeterministicParameter[] = [];

        for (const acc of this.params.values()) {
            const type = resolveType(acc.types);
            result.push({
                name: acc.name,
                type,
                isRequired: acc.usedUnconditionally,
                defaultValue: acc.defaultValue,
                isSystemVariable: acc.name.startsWith('_'),
                appliedFilters: [...acc.filters],
                properties: buildPropertyTree(acc.properties),
                usages: acc.usages,
            });
        }

        // Sort alphabetically for deterministic output
        result.sort((a, b) => a.name.localeCompare(b.name));
        return result;
    }

    // ─── Handler dispatch table ──────────────────────────────────────────────
    private handlers: Record<string, (node: ASTNode) => void> = {
        Root: (n) => this.walkChildren(n),
        NodeList: (n) => this.walkChildren(n),
        Output: (n) => this.walkChildren(n),
        TemplateData: () => { /* static text, skip */ },

        Symbol: (n) => this.handleSymbol(n),
        LookupVal: (n) => this.handleLookupVal(n),
        Filter: (n) => this.handleFilter(n),
        For: (n) => this.handleFor(n),
        If: (n) => this.handleIf(n),
        Set: (n) => this.handleSet(n),
        Macro: (n) => this.handleMacro(n),
        And: (n) => this.handleBinaryOp(n),
        Or: (n) => this.handleOr(n),
        Not: (n) => this.handleUnaryOp(n),
        Add: (n) => this.handleBinaryOp(n),
        Sub: (n) => this.handleBinaryOp(n),
        Mul: (n) => this.handleBinaryOp(n),
        Div: (n) => this.handleBinaryOp(n),
        Mod: (n) => this.handleBinaryOp(n),
        Pow: (n) => this.handleBinaryOp(n),
        Neg: (n) => this.handleUnaryOp(n),
        Pos: (n) => this.handleUnaryOp(n),
        FloorDiv: (n) => this.handleBinaryOp(n),
        Concat: (n) => this.handleBinaryOp(n),
        Compare: (n) => this.handleCompare(n),
        In: (n) => this.handleBinaryOp(n),
        Is: (n) => this.handleBinaryOp(n),
        InlineIf: (n) => this.handleInlineIf(n),
        Group: (n) => this.walkChildren(n),
        Array: (n) => this.walkChildren(n),
        Dict: (n) => this.walkChildren(n),
        Pair: (n) => this.handlePair(n),
        FunCall: (n) => this.handleFunCall(n),
        Caller: (n) => this.walkBody(n),
        Block: (n) => this.walkBody(n),
        Extends: () => { /* skip */ },
        Include: () => { /* skip */ },
        Import: () => { /* skip */ },
        FromImport: () => { /* skip */ },
        CallExtension: (n) => this.handleCallExtension(n),
        CallExtensionAsync: (n) => this.handleCallExtension(n),
        Capture: (n) => this.walkBody(n),
        Literal: () => { /* literal values like 'string', 42, true */ },
        // KeywordArgs handled via FunCall args
        KeywordArgs: (n) => this.walkChildren(n),
    };

    // ─── Node handlers ───────────────────────────────────────────────────────

    /**
     * Handle a standalone Symbol reference: `{{ name }}`
     */
    private handleSymbol(node: ASTNode): void {
        const name = node.value as string;
        if (this.isLocal(name) || isBuiltinSymbol(name)) return;

        this.recordUsage(name, 'Scalar', node, name);
    }

    /**
     * Handle property access: `{{ user.name }}`, `{{ user.address.city }}`
     * Walks up the LookupVal chain to find the root symbol.
     */
    private handleLookupVal(node: ASTNode): void {
        const { rootName, path } = resolveLookupChain(node);
        if (!rootName || this.isLocal(rootName) || isBuiltinSymbol(rootName)) return;

        // The root is an Object type, and we record the property path
        const fullPath = path.join('.');
        this.recordUsage(rootName, 'Object', node, fullPath);
        this.recordPropertyAccess(rootName, path.slice(1)); // skip the root name itself
    }

    /**
     * Handle filter expressions: `{{ val | safe }}`, `{{ items | join(', ') }}`
     * The filter name is NOT a parameter. The first arg of `args` is the expression being filtered.
     */
    private handleFilter(node: ASTNode): void {
        const filterName = typeof node.name === 'string' ? node.name : (node.name as ASTNode)?.value as string;

        // Check for `| default('value')` filter — extracts the default value
        if (filterName === 'default' && node.args?.children && node.args.children.length >= 2) {
            const expr = node.args.children[0];
            const defaultNode = node.args.children[1];
            const paramName = extractRootSymbol(expr);
            if (paramName && !this.isLocal(paramName) && !isBuiltinSymbol(paramName)) {
                const defaultVal = defaultNode.value;
                if (defaultVal !== undefined) {
                    this.ensureParam(paramName).defaultValue = String(defaultVal);
                }
            }
        }

        // Record the filter name on the parameter (for metadata)
        if (filterName && node.args?.children && node.args.children.length > 0) {
            const expr = node.args.children[0];
            const paramName = extractRootSymbol(expr);
            if (paramName && !this.isLocal(paramName) && !isBuiltinSymbol(paramName)) {
                this.ensureParam(paramName).filters.add(filterName);
            }
        }

        // Walk the filtered expression (first arg), skip subsequent literal args
        if (node.args?.children && node.args.children.length > 0) {
            this.walk(node.args.children[0]);
        }
    }

    /**
     * Handle `{% for item in items %}` loops.
     * `name` is the loop variable (local), `arr` is the iterable (parameter).
     */
    private handleFor(node: ASTNode): void {
        // Walk the iterable expression — this is where the parameter reference lives
        if (node.arr) {
            // Before walking, mark the iterable as an Array type
            const iterableName = extractRootSymbol(node.arr);
            if (iterableName && !this.isLocal(iterableName) && !isBuiltinSymbol(iterableName)) {
                // If the arr is a LookupVal (e.g., `entity.fields`), the root is Object, but the leaf is Array
                if (node.arr.typename === 'LookupVal') {
                    this.handleLookupVal(node.arr);
                    // Mark the leaf property as Array type
                    const { path } = resolveLookupChain(node.arr);
                    if (path.length > 1) {
                        this.markPropertyAsArray(iterableName, path.slice(1));
                    }
                } else {
                    this.recordUsage(iterableName, 'Array', node.arr, iterableName);
                }
            } else {
                // If it's a complex expression, walk it normally
                this.walk(node.arr);
            }
        }

        // Push loop variable into scope
        const loopVar = this.extractForLoopVar(node);
        this.pushScope(loopVar ? [loopVar] : []);

        // Walk the loop body with the loop var in scope
        if (node.body) this.walk(node.body);
        if (node.else_) this.walk(node.else_);

        this.popScope();
    }

    /**
     * Handle `{% if condition %}...{% elif %}...{% else %}...{% endif %}`.
     * Tracks which parameters are being guarded by the conditional.
     *
     * A parameter referenced in the condition expression (e.g., `{% if foo %}`) is
     * considered "guarded" — both the condition reference itself AND any usage in the
     * body are marked conditional, because the entire block only runs when the param
     * is truthy/present, implying it's optional.
     */
    private handleIf(node: ASTNode): void {
        // Detect which params are being guarded by this condition
        const guardedNames = extractReferencedParams(node.cond, this.currentLocals());

        // Push conditional guard context BEFORE walking the condition,
        // so the condition's own references are also marked conditional.
        const previousGuarded = new Set(this.guardedParams);
        for (const name of guardedNames) {
            this.guardedParams.add(name);
        }
        this.conditionalDepth++;

        // Walk the condition (params referenced here are recorded as conditional)
        if (node.cond) this.walk(node.cond);

        // Walk the true branch
        if (node.body) this.walk(node.body);

        // Restore guard context before walking elif/else
        this.conditionalDepth--;
        for (const name of guardedNames) {
            if (!previousGuarded.has(name)) {
                this.guardedParams.delete(name);
            }
        }
        if (node.else_) this.walk(node.else_);
    }

    /**
     * Handle `{% set x = expr %}` — introduces a local variable.
     *
     * Nunjucks Set nodes store the value expression in the `.value` property
     * (which is an AST node, not a primitive), and for capture form
     * `{% set x %}...{% endset %}` the content is in `.body`.
     */
    private handleSet(node: ASTNode): void {
        // Walk the value expression first (it may reference params).
        // The Set node uses `.value` for the assigned expression — but our ASTNode
        // interface types `.value` as `string | number | boolean`. At runtime the
        // Set node's `.value` is actually another AST node (e.g., Add, Symbol, etc.).
        const valueExpr = (node as unknown as Record<string, unknown>).value;
        if (valueExpr && typeof valueExpr === 'object' && 'typename' in valueExpr) {
            this.walk(valueExpr as ASTNode);
        }
        // Also check body ({% set x %}...{% endset %} capture form)
        if (node.body) this.walk(node.body);

        // Then add the variable to the current scope
        if (node.targets) {
            for (const target of node.targets) {
                if (target.typename === 'Symbol' && typeof target.value === 'string') {
                    this.currentScope().locals.add(target.value);
                }
            }
        }
    }

    /**
     * Handle `{% macro name(arg1, arg2) %}...{% endmacro %}`.
     * Macro args are local, not parameters.
     */
    private handleMacro(node: ASTNode): void {
        const macroArgs: string[] = [];
        if (node.args?.children) {
            for (const arg of node.args.children) {
                if (arg.typename === 'Symbol' && typeof arg.value === 'string') {
                    macroArgs.push(arg.value);
                }
            }
        }

        this.pushScope(macroArgs);
        if (node.body) this.walk(node.body);
        this.popScope();
    }

    /**
     * Handle binary operations: `{{ a + b }}`, `{{ a and b }}`, etc.
     */
    private handleBinaryOp(node: ASTNode): void {
        if (node.left) this.walk(node.left);
        if (node.right) this.walk(node.right);
    }

    /**
     * Handle `{{ desc or 'fallback' }}` — the Or node.
     * When the right side is a Literal, it's a default value.
     */
    private handleOr(node: ASTNode): void {
        if (node.left) this.walk(node.left);

        // Check if right side is a literal (fallback/default pattern)
        if (node.right?.typename === 'Literal' && node.left) {
            const paramName = extractRootSymbol(node.left);
            if (paramName && !this.isLocal(paramName) && !isBuiltinSymbol(paramName)) {
                const acc = this.ensureParam(paramName);
                if (acc.defaultValue === null && node.right.value !== undefined) {
                    acc.defaultValue = String(node.right.value);
                }
            }
        }

        if (node.right) this.walk(node.right);
    }

    /**
     * Handle unary operations: `{{ not x }}`, `{{ -x }}`
     */
    private handleUnaryOp(node: ASTNode): void {
        if (node.target) this.walk(node.target);
        if (node.expr) this.walk(node.expr);
    }

    /**
     * Handle Compare nodes: `{{ a > 0 }}`, `{{ a == b }}`
     */
    private handleCompare(node: ASTNode): void {
        if (node.expr) this.walk(node.expr);
        if (node.ops) {
            for (const op of node.ops) {
                if (op.expr) this.walk(op.expr);
            }
        }
    }

    /**
     * Handle inline ternary: `{{ 'yes' if active else 'no' }}`
     */
    private handleInlineIf(node: ASTNode): void {
        if (node.cond) this.walk(node.cond);
        if (node.body) this.walk(node.body);
        if (node.else_) this.walk(node.else_);
    }

    /**
     * Handle Pair nodes (in Dict literals): `{{ {key: value} }}`
     */
    private handlePair(node: ASTNode): void {
        // key is typically a Literal, value may reference a param
        if (node.val) this.walk(node.val);
        // walk key too in case it references a variable
        if (node.children) {
            for (const child of node.children) {
                this.walk(child);
            }
        }
    }

    /**
     * Handle FunCall nodes (function calls): `{{ range(10) }}`, etc.
     */
    private handleFunCall(node: ASTNode): void {
        if (node.name) {
            const nameNode = node.name as ASTNode;
            if (nameNode.typename) this.walk(nameNode);
        }
        if (node.args?.children) {
            for (const arg of node.args.children) {
                this.walk(arg);
            }
        }
    }

    /**
     * Handle CallExtension/CallExtensionAsync nodes (custom Nunjucks extensions).
     * MJ uses `{% template "Name" %}` and `{% AIPrompt %}...{% endAIPrompt %}`.
     */
    private handleCallExtension(node: ASTNode): void {
        // Walk any content args (the body between extension tags)
        if (node.contentArgs) {
            for (const arg of node.contentArgs) {
                this.walk(arg);
            }
        }
        // Walk regular args
        if (node.args?.children) {
            for (const arg of node.args.children) {
                this.walk(arg);
            }
        }
    }

    // ─── Scope management ────────────────────────────────────────────────────

    private pushScope(locals: string[]): void {
        this.scopeStack.push({ locals: new Set(locals) });
    }

    private popScope(): void {
        if (this.scopeStack.length > 1) {
            this.scopeStack.pop();
        }
    }

    private currentScope(): Scope {
        return this.scopeStack[this.scopeStack.length - 1];
    }

    private currentLocals(): Set<string> {
        const all = new Set<string>();
        for (const scope of this.scopeStack) {
            for (const local of scope.locals) {
                all.add(local);
            }
        }
        return all;
    }

    private isLocal(name: string): boolean {
        for (const scope of this.scopeStack) {
            if (scope.locals.has(name)) return true;
        }
        return false;
    }

    // ─── Parameter accumulation ──────────────────────────────────────────────

    private ensureParam(name: string): ParamAccumulator {
        let acc = this.params.get(name);
        if (!acc) {
            acc = {
                name,
                types: new Set(),
                usedUnconditionally: false,
                defaultValue: null,
                filters: new Set(),
                properties: new Map(),
                usages: [],
            };
            this.params.set(name, acc);
        }
        return acc;
    }

    private recordUsage(name: string, type: TemplateParamType, node: ASTNode, accessPath: string): void {
        const acc = this.ensureParam(name);
        acc.types.add(type);

        const isConditional = this.guardedParams.has(name) || this.conditionalDepth > 0;
        if (!isConditional) {
            acc.usedUnconditionally = true;
        }

        acc.usages.push({
            line: node.lineno,
            col: node.colno,
            accessPath,
            isConditional,
        });
    }

    private recordPropertyAccess(rootName: string, propertyPath: string[]): void {
        if (propertyPath.length === 0) return;
        const acc = this.ensureParam(rootName);
        let propMap = acc.properties;
        for (let i = 0; i < propertyPath.length; i++) {
            const propName = propertyPath[i];
            let propAcc = propMap.get(propName);
            if (!propAcc) {
                propAcc = {
                    name: propName,
                    types: new Set<TemplateParamType>(['Scalar']),
                    usedUnconditionally: !this.guardedParams.has(rootName) && this.conditionalDepth === 0,
                    children: new Map(),
                };
                propMap.set(propName, propAcc);
            }
            if (!this.guardedParams.has(rootName) && this.conditionalDepth === 0) {
                propAcc.usedUnconditionally = true;
            }
            propMap = propAcc.children;
        }
    }

    private markPropertyAsArray(rootName: string, propertyPath: string[]): void {
        const acc = this.ensureParam(rootName);
        let propMap = acc.properties;
        for (let i = 0; i < propertyPath.length; i++) {
            const propName = propertyPath[i];
            let propAcc = propMap.get(propName);
            if (!propAcc) {
                propAcc = {
                    name: propName,
                    types: new Set<TemplateParamType>(),
                    usedUnconditionally: true,
                    children: new Map(),
                };
                propMap.set(propName, propAcc);
            }
            if (i === propertyPath.length - 1) {
                propAcc.types.add('Array');
            }
            propMap = propAcc.children;
        }
    }

    /**
     * Extract the for-loop variable name from a For AST node.
     */
    private extractForLoopVar(node: ASTNode): string | null {
        // In Nunjucks AST, For node has `name` as a Symbol node for the loop variable
        if (node.name && typeof node.name === 'object' && 'value' in node.name) {
            return (node.name as ASTNode).value as string;
        }
        return null;
    }

    // ─── Generic child walking ───────────────────────────────────────────────

    private walkChildren(node: ASTNode): void {
        if (node.children) {
            for (const child of node.children) {
                this.walk(child);
            }
        }
    }

    private walkBody(node: ASTNode): void {
        if (node.body) this.walk(node.body);
        if (node.else_) this.walk(node.else_);
    }
}

// ═══════════════════════════════════════════════════
// Pure helper functions
// ═══════════════════════════════════════════════════

/**
 * Walk a LookupVal chain to extract the root symbol and the full property path.
 * `{{ user.address.city }}` → rootName: "user", path: ["user", "address", "city"]
 */
function resolveLookupChain(node: ASTNode): { rootName: string | null; path: string[] } {
    const path: string[] = [];
    let current: ASTNode = node;

    while (current.typename === 'LookupVal') {
        if (current.val && typeof current.val.value === 'string') {
            path.unshift(current.val.value);
        }
        current = current.target!;
    }

    if (current.typename === 'Symbol' && typeof current.value === 'string') {
        path.unshift(current.value);
        return { rootName: current.value, path };
    }

    return { rootName: null, path };
}

/**
 * Extract the root symbol name from an expression node.
 * Works for Symbol, LookupVal chains, and Filter wrapped expressions.
 */
function extractRootSymbol(node: ASTNode | undefined): string | null {
    if (!node) return null;

    if (node.typename === 'Symbol') {
        return typeof node.value === 'string' ? node.value : null;
    }
    if (node.typename === 'LookupVal') {
        const { rootName } = resolveLookupChain(node);
        return rootName;
    }
    if (node.typename === 'Filter' && node.args?.children && node.args.children.length > 0) {
        return extractRootSymbol(node.args.children[0]);
    }
    return null;
}

/**
 * Extract all parameter names referenced in a conditional expression.
 * Used to determine which params are guarded by an `{% if %}` block.
 */
function extractReferencedParams(node: ASTNode | undefined, locals: Set<string>): string[] {
    if (!node) return [];
    const names: string[] = [];

    function collect(n: ASTNode): void {
        if (n.typename === 'Symbol' && typeof n.value === 'string') {
            if (!locals.has(n.value) && !isBuiltinSymbol(n.value)) {
                names.push(n.value);
            }
        } else if (n.typename === 'LookupVal') {
            const { rootName } = resolveLookupChain(n);
            if (rootName && !locals.has(rootName) && !isBuiltinSymbol(rootName)) {
                names.push(rootName);
            }
        } else {
            // Walk children of compound expressions (And, Or, Not, Compare, etc.)
            if (n.left) collect(n.left);
            if (n.right) collect(n.right);
            if (n.target) collect(n.target);
            if (n.expr) collect(n.expr);
            if (n.children) n.children.forEach(collect);
            if (n.args?.children) n.args.children.forEach(collect);
            if (n.ops) {
                for (const op of n.ops) {
                    if (op.expr) collect(op.expr);
                }
            }
        }
    }

    collect(node);
    return [...new Set(names)];
}

/**
 * Determine if a symbol name is a Nunjucks built-in (not a template parameter).
 */
function isBuiltinSymbol(name: string): boolean {
    return BUILTIN_SYMBOLS.has(name);
}

const BUILTIN_SYMBOLS = new Set([
    'loop',     // Nunjucks loop context variable
    'true',
    'false',
    'null',
    'none',
    'undefined',
    'range',    // Built-in function
    'cycler',   // Built-in function
    'joiner',   // Built-in function
    'caller',   // Block variable
    'super',    // Block variable
]);

/**
 * Resolve the final type from a set of observed types.
 * Priority: Array > Object > Scalar (most complex wins).
 */
function resolveType(types: Set<TemplateParamType>): TemplateParamType {
    if (types.has('Array')) return 'Array';
    if (types.has('Object')) return 'Object';
    if (types.has('Record')) return 'Record';
    if (types.has('Entity')) return 'Entity';
    return 'Scalar';
}

/**
 * Convert the internal property accumulator map into the public PropertyAccess tree.
 */
function buildPropertyTree(propMap: Map<string, PropAccumulator>): PropertyAccess[] {
    const result: PropertyAccess[] = [];
    for (const acc of propMap.values()) {
        result.push({
            name: acc.name,
            type: resolveType(acc.types),
            optional: !acc.usedUnconditionally,
            children: buildPropertyTree(acc.children),
        });
    }
    result.sort((a, b) => a.name.localeCompare(b.name));
    return result;
}
