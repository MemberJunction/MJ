/**
 * @fileoverview Live object <-> string binding for JSON text columns, plus the runtime half of
 * JSONType validation (structural Zod + `@CHECK` rules).
 *
 * A JSONType field (`EntityField.JSONType`) is a text column holding JSON. CodeGen emits a typed
 * `<Field>Object` accessor on the entity subclass; that accessor delegates to a
 * {@link JSONFieldBinding} owned by the `BaseEntity` instance, so the object <-> string logic lives
 * exactly once, here, instead of being copied into every generated accessor.
 *
 * @module @memberjunction/core
 */

import { z } from 'zod';
import type { BaseEntity } from './baseEntity';
import { ValidationErrorInfo, ValidationErrorType, ValidationResult } from './entityInfo';
import { TryParseJsonText } from './extendedTypeValue';
import { LogError } from './logging';

/* ------------------------------------------------------------------------------------------------
 * ToPlainJSON
 * ---------------------------------------------------------------------------------------------- */

/**
 * Returns a deep, plain (un-proxied) copy of a JSON-compatible value.
 *
 * THE way to clone, `structuredClone`, `postMessage`, store in IndexedDB, or freeze a value obtained
 * from a generated `<Field>Object` JSONType accessor. Those accessors return a live `Proxy`; a Proxy
 * cannot be structured-cloned (`DataCloneError`), and a clone of it made any other way may still
 * hold live references back into the entity.
 *
 * Works identically on ordinary, non-proxied values, so callers never have to know which they hold.
 * The result has JSON semantics — it is equal to `JSON.parse(JSON.stringify(value))`: `undefined`
 * members and functions are dropped, `Date`s become ISO strings. Primitives, `null` and `undefined`
 * are returned as they are.
 *
 * @param value - any JSON-compatible value, proxied or not
 * @returns an independent plain copy; mutating it never touches the source or the entity
 */
export function ToPlainJSON<T>(value: T): T {
    if (value === null || value === undefined || typeof value !== 'object') {
        return value;
    }
    return JSON.parse(JSON.stringify(value));
}

/* ------------------------------------------------------------------------------------------------
 * Live binding
 * ---------------------------------------------------------------------------------------------- */

/** True for the only values the binding wraps: plain objects (incl. null-prototype) and arrays. */
function isWrappable(value: unknown): value is object {
    if (typeof value !== 'object' || value === null) {
        return false;
    }
    if (Array.isArray(value)) {
        return true;
    }
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
}

/** Serializes to the canonical stored form; `null`/`undefined` (and unserializable values) → `null`. */
function serializeJSON(value: unknown): string | null {
    if (value === null || value === undefined) {
        return null;
    }
    const text = JSON.stringify(value);
    return text === undefined ? null : text;
}

/**
 * One parse generation of a binding: the proxies handed out for one parsed document. When the raw
 * text changes by any other route, the binding starts a new tree and this one becomes detached —
 * writes through its proxies no longer reach the entity.
 */
interface JSONTree {
    Proxies: WeakMap<object, object>;
    Handler: ProxyHandler<object>;
}

interface ProxyOwner {
    Tree: JSONTree;
    Target: object;
}

/** Proxy → owning tree/target, so assignments can tell a proxy from a plain value. */
const proxyOwners = new WeakMap<object, ProxyOwner>();

/**
 * Binds one JSON text field of one entity instance to a live, typed object view.
 *
 * - **Object → string.** {@link GetValue} returns a `Proxy` over the parsed document. Nested plain
 *   objects/arrays are wrapped lazily on read (WeakMap-cached, so `o.a === o.a`), so *every*
 *   reference obtained from the root — however deep, or kept in a local variable — is tracked. Each
 *   mutation re-serializes the root and writes it through the entity's normal `Set`, so dirty
 *   tracking and change events work unchanged. Writes that do not change the canonical JSON do not
 *   call `Set`.
 * - **String → object.** The binding remembers the raw text it last saw. When the field's raw value
 *   differs on the next read (Load, LoadFromData, `Set`, revert, …) the document is re-parsed;
 *   proxies handed out earlier are then detached (reads still work; WRITES through them throw, so a
 *   stale reference can never silently lose an edit or alter the entity behind its dirty tracking). A change that only re-formats identical JSON keeps
 *   the current tree so live references survive a `Save()` round trip.
 * - **Safety net.** A value assigned into the tree and then mutated through the caller's *original*
 *   reference is invisible to the proxy; {@link Flush} (called by `BaseEntity` before validation and
 *   save) re-serializes the tree and writes any difference.
 *
 * Only plain objects and arrays are wrapped. `Date`, `Map`, class instances etc. are left alone —
 * wrapping them would break their internal slots.
 */
export class JSONFieldBinding<T = unknown> {
    private _materialized = false;
    private _tree: JSONTree | null = null;
    private _root: unknown = null;
    /** Raw text the current tree corresponds to (as last read from, or written to, the entity). */
    private _rawSeen: string | null = null;
    /** Canonical serialization of the tree at the last sync point; the no-op-write comparator. */
    private _snapshot: string | null = null;

    /**
     * @param FieldName - the JSON text field this binding is for (used in error messages)
     * @param readRaw - reads the field's raw text from the entity
     * @param writeRaw - writes raw text to the entity through its normal `Set` path
     */
    constructor(
        public readonly FieldName: string,
        private readonly readRaw: () => unknown,
        private readonly writeRaw: (raw: string | null) => void,
    ) {}

    /** True once the object has been read or assigned at least once. */
    public get IsMaterialized(): boolean {
        return this._materialized;
    }

    /**
     * Returns the live view of the field: a `Proxy` over the parsed document for objects/arrays, the
     * bare value for a primitive JSON root, and `null` for a null/empty field.
     *
     * @throws Error when the field holds text that is not valid JSON
     */
    public GetValue(): T | null {
        this.refresh();
        return this.wrap(this._tree as JSONTree, this._root) as T | null;
    }

    /**
     * Assigns a whole new value. `null`/`undefined` clears the field. A plain object/array is
     * *adopted* as the new tree, so later mutation through the caller's own reference is picked up by
     * {@link Flush}. Proxies from other records (or from a detached earlier tree) are deep-copied
     * rather than shared.
     */
    public SetValue(value: T | null | undefined): void {
        const owner = typeof value === 'object' && value !== null ? proxyOwners.get(value) : undefined;
        if (owner && owner.Tree === this._tree && this._materialized) {
            if (owner.Target === this._root && this.currentRaw() === this._rawSeen) {
                // Re-assigning the live root (`rec.X = rec.X`, or a root that was read, edited and
                // handed back): nothing new to adopt. Keep the generation so every proxy already
                // handed out stays attached; just push any pending difference.
                this.sync(owner.Tree);
                return;
            }
            if (owner.Target !== this._root) {
                // A NESTED node of the current tree becoming the root (`rec.X = rec.X.Child`) is
                // stored as an independent COPY: the node still lives inside the old document, and
                // sharing it would let two documents alias one object.
                this.assignPlain(ToPlainJSON(value));
                return;
            }
        }
        this.assignPlain(this.normalize(this._tree, value));
    }

    private assignPlain(plain: unknown): void {
        const raw = serializeJSON(plain);
        const alreadyCurrent = this._materialized && this.currentRaw() === this._rawSeen && raw === this._snapshot;
        if (!alreadyCurrent) {
            this.writeRaw(raw);
        }
        this.adopt(plain ?? null, raw, raw);
    }

    /**
     * Safety net: pushes the tree's current serialization to the entity if it differs from the last
     * sync point. A no-op for a binding that was never read/assigned, and for a tree whose raw text
     * was replaced from outside (the next read re-parses; there is nothing of ours to push).
     */
    public Flush(): void {
        if (!this._materialized || this._tree === null) {
            return;
        }
        if (this.currentRaw() !== this._rawSeen) {
            return;
        }
        this.sync(this._tree);
    }

    /**
     * Forgets the parsed tree: the next read re-parses from the entity's raw text and every proxy
     * handed out so far is detached. Used when the record's data is replaced wholesale (Revert,
     * reload, NewRecord) — including the case where the replacement text is identical to the text
     * this tree started from, which the raw-text comparison alone cannot distinguish from "nothing
     * happened" when the tree carries un-flushed edits.
     */
    public Invalidate(): void {
        this._materialized = false;
        this._tree = null;
        this._root = null;
        this._rawSeen = null;
        this._snapshot = null;
    }

    private currentRaw(): string | null {
        const raw = this.readRaw();
        return typeof raw === 'string' ? raw : null;
    }

    /** Re-parses when the entity's raw text is not the text this tree corresponds to. */
    private refresh(): void {
        const raw = this.currentRaw();
        if (this._materialized && raw === this._rawSeen) {
            return;
        }
        const parsed = this.parseRaw(raw);
        const canonical = serializeJSON(parsed);
        if (this._materialized && canonical === this._snapshot) {
            // Formatting-only change (whitespace/key order after a save round trip): the document is
            // the same, so keep the tree and the references already handed out.
            this._rawSeen = raw;
            return;
        }
        this.adopt(parsed, raw, canonical);
    }

    private parseRaw(raw: string | null): unknown {
        if (raw === null || raw === '') {
            return null;
        }
        const parsed = TryParseJsonText(raw);
        if (parsed.ok === false) {
            throw new Error(`JSON field '${this.FieldName}' does not contain valid JSON: ${parsed.message}`);
        }
        return parsed.value;
    }

    /** Makes `root` the current tree and starts a new proxy generation (detaching the old one). */
    private adopt(root: unknown, raw: string | null, canonical: string | null): void {
        this._root = root;
        this._rawSeen = raw;
        this._snapshot = canonical;
        this._materialized = true;
        this._tree = this.createTree();
    }

    /** Re-serializes the tree and writes it through the entity when the canonical JSON changed. */
    private sync(tree: JSONTree): void {
        if (tree !== this._tree) {
            return; // detached generation: the entity no longer reflects this tree
        }
        const canonical = serializeJSON(this._root);
        if (canonical === this._snapshot) {
            return;
        }
        const previousSeen = this._rawSeen;
        const previousSnapshot = this._snapshot;
        // Recorded BEFORE the write so a listener that reads the accessor mid-Set does not re-parse.
        this._snapshot = canonical;
        this._rawSeen = canonical;
        try {
            this.writeRaw(canonical);
        } catch (error) {
            this._snapshot = previousSnapshot;
            this._rawSeen = previousSeen;
            throw error;
        }
    }

    private wrap(tree: JSONTree, value: unknown): unknown {
        if (!isWrappable(value)) {
            return value;
        }
        let proxy = tree.Proxies.get(value);
        if (!proxy) {
            proxy = new Proxy(value, tree.Handler);
            tree.Proxies.set(value, proxy);
            proxyOwners.set(proxy, { Tree: tree, Target: value });
        }
        return proxy;
    }

    private createTree(): JSONTree {
        const tree: JSONTree = { Proxies: new WeakMap<object, object>(), Handler: {} };
        tree.Handler = this.createHandler(tree);
        return tree;
    }

    private createHandler(tree: JSONTree): ProxyHandler<object> {
        const hasOwn = (target: object, prop: PropertyKey): boolean => Object.prototype.hasOwnProperty.call(target, prop);
        return {
            get: (target, prop, receiver) => {
                const value = Reflect.get(target, prop, receiver);
                if (typeof prop === 'symbol' || !isWrappable(value) || !hasOwn(target, prop)) {
                    return value;
                }
                // Proxy invariant: a non-configurable, non-writable own data property must report its
                // true value, so a frozen node hands back its raw children instead of proxies.
                const descriptor = Reflect.getOwnPropertyDescriptor(target, prop);
                if (descriptor && !descriptor.configurable && !descriptor.writable) {
                    return value;
                }
                return this.wrap(tree, value);
            },
            set: (target, prop, value) => {
                this.assertAttached(tree);
                const stored = this.normalize(tree, value);
                const had = hasOwn(target, prop);
                const previous = had ? Reflect.get(target, prop) : undefined;
                const ok = Reflect.set(target, prop, stored);
                // An array `push` fires an index set and then a `length` set; the second changes
                // nothing, so it costs no second serialization.
                if (ok && (!had || !Object.is(previous, stored))) {
                    this.sync(tree);
                }
                return ok;
            },
            deleteProperty: (target, prop) => {
                this.assertAttached(tree);
                const had = hasOwn(target, prop);
                const ok = Reflect.deleteProperty(target, prop);
                if (ok && had) {
                    this.sync(tree);
                }
                return ok;
            },
            defineProperty: (target, prop, descriptor) => {
                this.assertAttached(tree);
                const next = 'value' in descriptor
                    ? { ...descriptor, value: this.normalize(tree, descriptor.value) }
                    : descriptor;
                const ok = Reflect.defineProperty(target, prop, next);
                if (ok) {
                    this.sync(tree);
                }
                return ok;
            },
        };
    }

    /**
     * A proxy handed out before the record's data was replaced (reload, revert, assignment of a
     * whole new value, …) is DETACHED: its document no longer belongs to the entity. Reads still work,
     * but a write would either vanish or — worse, when the new document reuses nodes of the old one —
     * alter the entity behind its dirty tracking. Both are silent data loss, so a write through a
     * stale reference fails loudly instead.
     */
    private assertAttached(tree: JSONTree): void {
        // The raw text may have been replaced (`rec.Field = '...'`, `SetMany`) since the last read.
        // Re-sync first: a formatting-only change keeps this tree; a real change starts a new tree,
        // so this write is refused instead of overwriting the newer text.
        if (tree === this._tree) {
            this.refresh();
        }
        if (tree !== this._tree) {
            throw new Error(
                `JSON field '${this.FieldName}' was reloaded, reverted or replaced after this object was obtained; ` +
                `edits to the stale reference cannot reach the record. Re-read the object from the entity before editing it.`,
            );
        }
    }

    /**
     * Prepares a value for storage in `tree`: a proxy of that tree becomes its raw target; a proxy of
     * any other tree (another record, or a detached earlier generation) becomes an independent copy;
     * and proxies nested inside a plain object/array being assigned (the `{ ...rec.XObject, a: 1 }`
     * pattern hands over a plain object whose members ARE proxies) are replaced the same way, so the
     * stored document never contains proxy-of-proxy chains or references into a detached tree.
     */
    private normalize(tree: JSONTree | null, value: unknown): unknown {
        const top = this.resolveProxy(tree, value);
        if (top === value && isWrappable(value)) {
            this.replaceNestedProxies(tree, value, new WeakSet<object>());
        }
        return top;
    }

    private resolveProxy(tree: JSONTree | null, value: unknown): unknown {
        if (typeof value !== 'object' || value === null) {
            return value;
        }
        const owner = proxyOwners.get(value);
        if (!owner) {
            return value;
        }
        return tree !== null && owner.Tree === tree ? owner.Target : ToPlainJSON(value);
    }

    private replaceNestedProxies(tree: JSONTree | null, node: object, seen: WeakSet<object>): void {
        if (seen.has(node)) {
            return;
        }
        seen.add(node);
        const record = node as Record<string, unknown>;
        for (const key of Object.keys(node)) {
            const child = record[key];
            const replacement = this.resolveProxy(tree, child);
            if (replacement !== child && !Object.isFrozen(node)) {
                record[key] = replacement;
            }
            if (replacement === child && isWrappable(child)) {
                this.replaceNestedProxies(tree, child, seen);
            }
        }
    }
}

/* ------------------------------------------------------------------------------------------------
 * Validation
 * ---------------------------------------------------------------------------------------------- */

/** Severity a JSONType validation result is reported at (`@mjValidate warn` selects `'Warning'`). */
export type JSONFieldSeverity = 'Failure' | 'Warning';

/** How a rule's scope reaches from one declared type to another inside a JSON document. */
export interface JSONTypeGraphEdge {
    /** Property on the parent type. */
    Property: string;
    /** Declared type name of the child value(s). */
    Type: string;
    /** `object`: one value; `array`: each element; `record`: each value of a string-keyed map. */
    Shape: 'object' | 'array' | 'record';
}

/**
 * One `@CHECK` rule. `Test` receives the object the rule is scoped to and the owning entity, and
 * returns `true` when the value is VALID (mirroring a SQL CHECK).
 *
 * `Test` is declared with method syntax deliberately: generated code supplies concrete parameter
 * types (`value: MyEntity_IConfig`, `row: MyEntity`), which method parameter bivariance accepts.
 */
export interface JSONFieldRule {
    /** Declared type whose instances the rule is scoped to. */
    Type: string;
    /** Property the rule was written on; interface-level rules omit it. Names the error source. */
    Property?: string;
    /** When `Property` is array-typed the rule runs against each element rather than the array. */
    PerElement?: boolean;
    /** Plain-language statement of the rule, used as the validation message. */
    Description: string;
    Test(value: unknown, row: BaseEntity): boolean;
}

/**
 * The `@CHECK` rules of one JSONType plus the type graph needed to find every instance of each
 * rule's scope type inside a parsed document.
 */
export interface JSONFieldRuleSet {
    /** Declared name of the type bound to the field. */
    RootType: string;
    /** True when the field holds an array of `RootType`. */
    RootIsArray: boolean;
    /** Declared type name → edges to child types that (transitively) carry rules. */
    Graph: Record<string, JSONTypeGraphEdge[]>;
    Rules: JSONFieldRule[];
}

/** Renders a Zod/JSON path as `Field.Items[2].EndHour`. */
export function FormatJSONPath(fieldName: string, path: ReadonlyArray<string | number>): string {
    let text = fieldName;
    for (const segment of path) {
        text += typeof segment === 'number' ? `[${segment}]` : `.${segment}`;
    }
    return text;
}

/** Reads the value a Zod issue path points at; `undefined` when the path does not resolve. */
function valueAtPath(root: unknown, path: ReadonlyArray<string | number>): unknown {
    let current: unknown = root;
    for (const segment of path) {
        if (typeof current !== 'object' || current === null) {
            return undefined;
        }
        current = (current as Record<string | number, unknown>)[segment];
    }
    return current;
}

/**
 * Maps Zod issues to {@link ValidationErrorInfo}s whose `Source` is the dotted/indexed path of the
 * offending member (`Configuration.Items[2].EndHour`).
 */
export function ZodIssuesToValidationErrors(
    fieldName: string,
    issues: ReadonlyArray<z.ZodIssue>,
    parsed: unknown,
    severity: JSONFieldSeverity,
): ValidationErrorInfo[] {
    return issues.map((issue) => new ValidationErrorInfo(
        FormatJSONPath(fieldName, issue.path),
        issue.message,
        valueAtPath(parsed, issue.path),
        ValidationErrorType[severity],
    ));
}

/** Accumulates rule failures while walking a document. */
interface RuleWalkContext {
    FieldName: string;
    RuleSet: JSONFieldRuleSet;
    Row: BaseEntity;
    Severity: JSONFieldSeverity;
    Result: ValidationResult;
}

function joinPath(base: string, property: string): string {
    return base === '' ? property : `${base}.${property}`;
}

/** Runs one rule's `Test`; a rule that throws is reported, never swallowed. */
function runRule(ctx: RuleWalkContext, rule: JSONFieldRule, value: unknown, path: string): void {
    const source = path === '' ? ctx.FieldName : path.startsWith('[') ? `${ctx.FieldName}${path}` : `${ctx.FieldName}.${path}`;
    let valid: boolean;
    try {
        valid = rule.Test(value, ctx.Row);
    } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        LogError(`JSON field rule '${rule.Description}' on ${source} threw: ${detail}`);
        ctx.Result.Errors.push(new ValidationErrorInfo(source, `Rule could not be evaluated: ${rule.Description} (${detail})`, value, ValidationErrorType[ctx.Severity]));
        return;
    }
    if (!valid) {
        ctx.Result.Errors.push(new ValidationErrorInfo(source, rule.Description, value, ValidationErrorType[ctx.Severity]));
    }
}

/** Applies every rule scoped to `typeName` to one instance, then descends into child types. */
function walkInstance(ctx: RuleWalkContext, value: unknown, typeName: string, path: string): void {
    if (typeof value !== 'object' || value === null) {
        return;
    }
    const record = value as Record<string, unknown>;
    for (const rule of ctx.RuleSet.Rules) {
        if (rule.Type !== typeName) {
            continue;
        }
        if (rule.Property === undefined) {
            runRule(ctx, rule, value, path);
        } else if (rule.PerElement) {
            const elements = record[rule.Property];
            if (Array.isArray(elements)) {
                elements.forEach((element, index) => runRule(ctx, rule, element, `${joinPath(path, rule.Property as string)}[${index}]`));
            }
        } else {
            runRule(ctx, rule, value, joinPath(path, rule.Property));
        }
    }
    for (const edge of ctx.RuleSet.Graph[typeName] ?? []) {
        walkEdge(ctx, record[edge.Property], edge, joinPath(path, edge.Property));
    }
}

function walkEdge(ctx: RuleWalkContext, child: unknown, edge: JSONTypeGraphEdge, path: string): void {
    if (child === null || child === undefined) {
        return;
    }
    if (edge.Shape === 'object') {
        walkInstance(ctx, child, edge.Type, path);
    } else if (edge.Shape === 'array' && Array.isArray(child)) {
        child.forEach((element, index) => walkInstance(ctx, element, edge.Type, `${path}[${index}]`));
    } else if (edge.Shape === 'record' && typeof child === 'object') {
        for (const [key, element] of Object.entries(child as Record<string, unknown>)) {
            walkInstance(ctx, element, edge.Type, `${path}.${key}`);
        }
    }
}

/**
 * Runs the `@CHECK` rules of a rule set over a parsed document.
 *
 * @param fieldName - the JSON field, used as the first segment of every error source
 * @param parsed - the parsed document (already known to satisfy the structural schema)
 */
export function RunJSONFieldRules(
    fieldName: string,
    parsed: unknown,
    ruleSet: JSONFieldRuleSet,
    row: BaseEntity,
    severity: JSONFieldSeverity,
    result: ValidationResult,
): void {
    const ctx: RuleWalkContext = { FieldName: fieldName, RuleSet: ruleSet, Row: row, Severity: severity, Result: result };
    if (ruleSet.RootIsArray) {
        if (Array.isArray(parsed)) {
            parsed.forEach((element, index) => walkInstance(ctx, element, ruleSet.RootType, `[${index}]`));
        }
    } else {
        walkInstance(ctx, parsed, ruleSet.RootType, '');
    }
}

/**
 * Validates the raw text of one JSONType field against its structural schema and `@CHECK` rules and
 * appends any problems to `result`. The engine behind `BaseEntity.ValidateJSONField`.
 *
 * Empty/`null` text is skipped (the column's nullability governs that). Text that is not valid JSON
 * yields one error and skips the shape/rule checks. Rules run only when the structure is valid.
 * A `Warning` severity adds errors of type Warning, which do not fail the save.
 */
export function ValidateJSONFieldValue(
    fieldName: string,
    raw: unknown,
    schema: z.ZodTypeAny,
    ruleSet: JSONFieldRuleSet | null,
    severity: JSONFieldSeverity,
    row: BaseEntity,
    result: ValidationResult,
): void {
    if (raw === null || raw === undefined || raw === '') {
        return;
    }
    let parsed: unknown = raw;
    if (typeof raw === 'string') {
        const attempt = TryParseJsonText(raw);
        if (attempt.ok === false) {
            const alreadyReported = result.Errors.some((e) => e.Source === fieldName && /valid JSON/i.test(e.Message));
            if (!alreadyReported) {
                result.Errors.push(new ValidationErrorInfo(fieldName, `${fieldName} must be valid JSON. ${attempt.message}`, raw, ValidationErrorType[severity]));
            }
            return;
        }
        parsed = attempt.value;
    }
    const outcome = schema.safeParse(parsed);
    if (!outcome.success) {
        result.Errors.push(...ZodIssuesToValidationErrors(fieldName, outcome.error.issues, parsed, severity));
        return;
    }
    if (ruleSet && ruleSet.Rules.length > 0) {
        RunJSONFieldRules(fieldName, parsed, ruleSet, row, severity, result);
    }
}
