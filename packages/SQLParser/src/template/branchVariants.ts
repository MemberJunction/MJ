import type { Analysis, Span } from '../common/analysis.js';
import { WalkExpression } from './expressionTypes.js';
import type { TemplateExpression, TemplateLiteralValue } from './expressionTypes.js';
import { BranchEvaluator } from './branchEvaluator.js';
import type { BranchLookup, BranchValue } from './branchEvaluator.js';
import type { TemplateParameter } from './parameterAnalysis.js';
import type { IfNode, TemplateNode } from './templateNodes.js';
import { WalkTemplate } from './templateWalker.js';

/** Which `{% if %}` a variant toggles, and between which branches. */
export interface BranchToggle {
    /** The `{% if %}` block. */
    readonly IfSpan: Span;
    /** The branch the block takes in the base assignment, or `null` when the base does not reach it or cannot tell. */
    readonly FromBranch: number | null;
    /**
     * The branch this variant makes it take, or `null` when none could be reached. Branch
     * indexes count the `if`, then each `elif`; the branch count itself means the `else` (or,
     * with no `else`, that the block renders nothing).
     */
    readonly ToBranch: number | null;
}

/** One render of the template: the base assignment with some values overridden. */
export interface BranchVariant {
    /** 0 for the base, then one per `{% if %}` in source order. */
    readonly Index: number;
    /** The `{% if %}` this variant toggles; `null` for the base. */
    readonly Toggle: BranchToggle | null;
    /** The values that differ from the base assignment; empty for the base. */
    readonly Overrides: Readonly<Record<string, BranchValue>>;
    /**
     * Whether parameter values can make the toggled block take another branch. `false` when its
     * conditions read loop values, filtered values or `Context` comparisons, or when no tried
     * assignment worked; such a variant has no overrides and renders like the base.
     */
    readonly Satisfiable: boolean;
}

/** The base assignment and the variants to render. */
export interface BranchVariantSet {
    /** A value for every parameter: the base render. */
    readonly Base: Readonly<Record<string, BranchValue>>;
    /** The base variant first, then one per `{% if %}`: n + 1 renders for n blocks. */
    readonly Variants: readonly BranchVariant[];
}

/** The full assignment of one variant: the base values with its overrides applied. */
export function BranchVariantValues(set: BranchVariantSet, variant: BranchVariant): Record<string, BranchValue> {
    return { ...set.Base, ...variant.Overrides };
}

/** An `{% if %}` with the blocks around it. */
interface IfEntry {
    readonly Node: IfNode;
    readonly Path: readonly { readonly Node: IfNode; readonly Branch: number }[];
}

type Overlay = Map<string, BranchValue>;

const MAX_COMBINATIONS = 4096;
const COMPARISON_OPERATORS: readonly string[] = ['==', '!=', '<', '>', '<=', '>='];
const SAMPLE: BranchValue = { Kind: 'Sample' };
const ABSENT: BranchValue = { Kind: 'Absent' };

/**
 * Works out the branch variants of a template: a base assignment that takes the first branch of
 * every `{% if %}` it can, plus one variant per `{% if %}` that makes that block take a
 * different branch, with every block around it taking the branch that contains it. Rendering
 * them all shows each branch's SQL. A variant changes only the parameters its block (and the
 * blocks around it) read, so another block reading the same parameter changes with it.
 */
export class BranchVariantPlanner {
    private readonly ifs: IfEntry[] = [];
    private readonly parameterNames: ReadonlySet<string>;
    private readonly required: ReadonlySet<string>;
    private readonly base = new Map<string, BranchValue>();

    private constructor(nodes: readonly TemplateNode[], parameters: readonly TemplateParameter[], private readonly opaque: ReadonlySet<string>) {
        WalkTemplate(nodes, { Node: (node, scope) => { if (node.Kind === 'If') this.ifs.push({ Node: node, Path: scope.IfPath }); } });
        for (const p of parameters) this.base.set(p.Name, SAMPLE);
        this.parameterNames = new Set(parameters.map(p => p.Name));
        this.required = new Set(parameters.filter(p => p.IsRequired).map(p => p.Name));
    }

    /**
     * Plans the variants.
     * @param opaqueNames - Names parameters cannot set: loop and `{% set %}` variables.
     */
    static Plan(nodes: readonly TemplateNode[], parameters: readonly TemplateParameter[], opaqueNames: ReadonlySet<string>, complete: boolean): Analysis<BranchVariantSet> {
        const planner = new BranchVariantPlanner(nodes, parameters, opaqueNames);
        planner.chooseBase();
        const variants: BranchVariant[] = [{ Index: 0, Toggle: null, Overrides: {}, Satisfiable: true }];
        planner.ifs.forEach((entry, i) => variants.push(planner.variantFor(entry, i + 1)));
        return { Value: { Base: toRecord(planner.base), Variants: variants }, Complete: complete, Diagnostics: [] };
    }

    /** Takes the first branch of each block in source order, fixing the names each block reads. */
    private chooseBase(): void {
        const fixed = new Set<string>();
        for (const entry of this.ifs) {
            const condition = entry.Node.Branches[0].Condition;
            const candidates = this.candidatesFor([entry.Node]);
            const free = [...candidates.keys()].filter(n => !fixed.has(n));
            const found = search(free, candidates, n => this.base.get(n), lookup => this.evaluator(lookup).Truth(condition) === true);
            if (found) for (const [name, value] of found) this.base.set(name, value);
            for (const name of candidates.keys()) fixed.add(name);
        }
    }

    private variantFor(entry: IfEntry, index: number): BranchVariant {
        const baseLookup: BranchLookup = n => this.base.get(n);
        const from = this.reaches(entry, baseLookup) ? this.branchTaken(entry.Node, baseLookup) : null;
        const candidates = this.candidatesFor([...entry.Path.map(p => p.Node), entry.Node]);
        const names = [...candidates.keys()];
        const target = (lookup: BranchLookup): number | null => {
            if (!this.reaches(entry, lookup)) return null;
            const taken = this.branchTaken(entry.Node, lookup);
            return taken !== null && taken !== from ? taken : null;
        };
        const preferred = from === null ? 0 : from + 1;
        const found = search(names, candidates, baseLookup, l => target(l) === preferred) ?? search(names, candidates, baseLookup, l => target(l) !== null);
        const toggle = (to: number | null): BranchToggle => ({ IfSpan: entry.Node.Span, FromBranch: from, ToBranch: to });
        if (found === null) return { Index: index, Toggle: toggle(null), Overrides: {}, Satisfiable: false };
        const lookup: BranchLookup = n => found.get(n) ?? this.base.get(n);
        return { Index: index, Toggle: toggle(target(lookup)), Overrides: differences(this.base, found), Satisfiable: true };
    }

    /**
     * The values worth trying for each parameter the blocks read, in order: Sample, the literals
     * the blocks' conditions compare it with, and last Absent (unless the parameter is required),
     * so a present value is preferred.
     */
    private candidatesFor(blocks: readonly IfNode[]): Map<string, BranchValue[]> {
        const candidates = new Map<string, BranchValue[]>();
        for (const block of blocks) {
            for (const name of conditionNames(block, this.opaque)) {
                if (this.parameterNames.has(name) && !candidates.has(name)) candidates.set(name, [SAMPLE]);
            }
            for (const branch of block.Branches) collectComparisons(branch.Condition, candidates);
        }
        for (const [name, list] of candidates) if (!this.required.has(name)) list.push(ABSENT);
        return candidates;
    }

    /** Whether every block around the entry takes the branch that contains it. */
    private reaches(entry: IfEntry, lookup: BranchLookup): boolean {
        return entry.Path.every(p => this.branchTaken(p.Node, lookup) === p.Branch);
    }

    /** The branch an `{% if %}` takes, or `null` when it cannot be known. */
    private branchTaken(node: IfNode, lookup: BranchLookup): number | null {
        const evaluator = this.evaluator(lookup);
        for (let i = 0; i < node.Branches.length; i++) {
            const truth = evaluator.Truth(node.Branches[i].Condition);
            if (truth === null) return null;
            if (truth) return i;
        }
        return node.Branches.length;
    }

    private evaluator(lookup: BranchLookup): BranchEvaluator {
        return new BranchEvaluator(lookup, this.opaque);
    }
}

/**
 * Tries combinations of candidate values for `names` over `start`, returning the overlay of the
 * first combination `accept` takes, or `null`. Bounded: candidate lists are cut so the number of
 * combinations stays within {@link MAX_COMBINATIONS}.
 */
function search(
    names: readonly string[],
    candidates: ReadonlyMap<string, BranchValue[]>,
    start: BranchLookup,
    accept: (lookup: BranchLookup) => boolean,
): Overlay | null {
    const lists = boundedLists(names.map(n => candidates.get(n) ?? [SAMPLE]));
    const overlay: Overlay = new Map();
    const lookup: BranchLookup = n => overlay.get(n) ?? start(n);
    const counters = names.map(() => 0);
    for (;;) {
        names.forEach((name, i) => overlay.set(name, lists[i][counters[i]]));
        if (accept(lookup)) return overlay;
        if (!advance(counters, lists)) return null;
    }
}

/**
 * Adds the literals a condition compares each parameter with to that parameter's candidates. A
 * side that is an inline if compares each name its branches can give.
 */
function collectComparisons(condition: TemplateExpression, candidates: Map<string, BranchValue[]>): void {
    WalkExpression(condition, node => {
        if (node.Kind !== 'Binary' || !COMPARISON_OPERATORS.includes(node.Operator)) return;
        for (const [side, other] of [[node.Left, node.Right], [node.Right, node.Left]]) {
            const value = literalOf(other);
            if (value === undefined) continue;
            for (const name of comparedNames(side)) {
                const list = candidates.get(name);
                if (list) for (const candidate of literalCandidates(value)) addCandidate(list, candidate);
            }
        }
    });
}

/** The names a compared side can give: the name itself, or the names of an inline if's branches. */
function comparedNames(side: TemplateExpression): string[] {
    if (side.Kind === 'Name') return [side.Name];
    if (side.Kind !== 'InlineIf') return [];
    return [...comparedNames(side.Body), ...(side.Else === null ? [] : comparedNames(side.Else))];
}

/** The value of a literal, or of a negated number literal; `undefined` for anything else. */
function literalOf(expression: TemplateExpression): TemplateLiteralValue | undefined {
    if (expression.Kind === 'Literal') return expression.Value;
    if (expression.Kind === 'Unary' && expression.Operator === '-' && expression.Operand.Kind === 'Literal' && typeof expression.Operand.Value === 'number') {
        return -expression.Operand.Value;
    }
    return undefined;
}

/** The parameter names an `{% if %}` block's conditions read. */
function conditionNames(node: IfNode, opaque: ReadonlySet<string>): string[] {
    const names: string[] = [];
    for (const branch of node.Branches) {
        WalkExpression(branch.Condition, n => {
            if (n.Kind === 'Name' && !opaque.has(n.Name) && !names.includes(n.Name)) names.push(n.Name);
        });
    }
    return names;
}

/** A compared literal, plus values on each side of it, so every comparison can go both ways. */
function literalCandidates(value: TemplateLiteralValue): BranchValue[] {
    const literal = (v: TemplateLiteralValue): BranchValue => ({ Kind: 'Literal', Value: v });
    if (typeof value === 'number') return [literal(value), literal(value + 1), literal(value - 1)];
    if (typeof value === 'string') return [literal(value), literal(`${value}_other`)];
    if (typeof value === 'boolean') return [literal(value), literal(!value)];
    return [literal(value)];
}

function sameValue(a: BranchValue, b: BranchValue): boolean {
    if (a.Kind === 'Literal' && b.Kind === 'Literal') return a.Value === b.Value;
    return a.Kind === b.Kind;
}

function addCandidate(list: BranchValue[], value: BranchValue): void {
    if (!list.some(existing => sameValue(existing, value))) list.push(value);
}

/** Cuts the longest candidate lists until the number of combinations is within bounds. */
function boundedLists(lists: BranchValue[][]): BranchValue[][] {
    const result = lists.map(l => [...l]);
    const product = () => result.reduce((n, l) => n * l.length, 1);
    while (product() > MAX_COMBINATIONS) {
        const longest = result.reduce((a, b) => (b.length > a.length ? b : a));
        longest.pop();
    }
    return result;
}

/** Steps an odometer of indexes; false once every combination has been seen. */
function advance(counters: number[], lists: readonly BranchValue[][]): boolean {
    for (let i = counters.length - 1; i >= 0; i--) {
        counters[i]++;
        if (counters[i] < lists[i].length) return true;
        counters[i] = 0;
    }
    return false;
}

function toRecord(values: ReadonlyMap<string, BranchValue>): Record<string, BranchValue> {
    const record: Record<string, BranchValue> = {};
    for (const [name, value] of values) record[name] = value;
    return record;
}

function differences(base: ReadonlyMap<string, BranchValue>, overlay: Overlay): Record<string, BranchValue> {
    const record: Record<string, BranchValue> = {};
    for (const [name, value] of overlay) {
        const before = base.get(name);
        if (before === undefined || !sameValue(before, value)) record[name] = value;
    }
    return record;
}
