/**
 * @fileoverview Pure (no database, no MJ runtime) analysis of a JSONType definition.
 *
 * A JSONType field's `EntityField.JSONTypeDefinition` is TypeScript source declaring the interface(s)
 * the JSON conforms to. CodeGen reads three things from it, all through the TypeScript AST:
 *
 * - **Opt-in.** A `@mjValidate` (optionally `@mjValidate warn`) JSDoc tag on the ROOT declaration —
 *   the one named by `EntityField.JSONType` — turns runtime validation on for the whole type.
 *   Decorators would be the natural spelling but are a parse error on interface members, and the
 *   existing definition validator would then silently demote the field to a plain string; JSDoc tags
 *   parse anywhere and are invisible to consumers of the interface.
 * - **Rules.** Standard JSON-Schema-style tags (`@minimum`, `@maxLength`, …) feed the structural Zod
 *   schema ({@link GenerateJSONTypeZod}); `@CHECK` tags become behavioural rules
 *   ({@link CollectJSONCheckRules}).
 * - **Rewriting.** Type names are prefixed with the owning entity's class name so two entities can
 *   declare the same JSONType name. {@link RewriteJSONTypeDefinition} does it via the AST so words
 *   inside JSDoc tag bodies are never touched.
 *
 * @module Misc/json-type-model
 */

import * as crypto from 'crypto';
import ts from 'typescript';

/** Severity a validation result is reported at. `@mjValidate warn` selects `'Warning'`. */
export type JSONValidationSeverity = 'Failure' | 'Warning';

/** A JSDoc tag reduced to its name and text. */
export interface JSONDocTag {
    Name: string;
    Text: string;
}

/** A top-level interface or type alias of a definition. */
export interface JSONDeclaration {
    Name: string;
    Node: ts.InterfaceDeclaration | ts.TypeAliasDeclaration;
    Tags: JSONDocTag[];
}

/** One property of a declaration, with the JSDoc tags written on it. */
export interface JSONMember {
    Name: string;
    Optional: boolean;
    TypeNode: ts.TypeNode;
    Tags: JSONDocTag[];
}

/** The parsed definition. */
export interface JSONTypeModel {
    SourceFile: ts.SourceFile;
    /** Every top-level interface / type alias, keyed by declared (un-prefixed) name. */
    Declarations: Map<string, JSONDeclaration>;
    /** Declared name of the type bound to the field (`EntityField.JSONType`). */
    RootName: string;
    /** True when the root carries `@mjValidate`. */
    OptedIn: boolean;
    Severity: JSONValidationSeverity;
}

/** Text of a tag's comment, tolerant of the several shapes the TypeScript API returns. */
function tagText(tag: ts.JSDocTag): string {
    return (ts.getTextOfJSDocComment(tag.comment) ?? '').trim();
}

/** Reads the JSDoc tags attached to a node (all JSDoc blocks, in order). */
export function ReadJSDocTags(node: ts.Node): JSONDocTag[] {
    return ts.getJSDocTags(node).map((tag) => ({ Name: tag.tagName.text, Text: tagText(tag) }));
}

/**
 * Parses a JSONTypeDefinition and reads the opt-in from the root declaration.
 *
 * @param definition - raw TypeScript from `EntityField.JSONTypeDefinition`
 * @param rootName - declared name of the type bound to the field
 * @returns the model, or null when `rootName` is not declared as an interface / type alias
 */
export function ParseJSONTypeDefinition(definition: string, rootName: string): JSONTypeModel | null {
    const sourceFile = ts.createSourceFile('jsontype.ts', definition, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const declarations = new Map<string, JSONDeclaration>();
    sourceFile.forEachChild((node) => {
        if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) {
            declarations.set(node.name.text, { Name: node.name.text, Node: node, Tags: ReadJSDocTags(node) });
        }
    });
    const root = declarations.get(rootName);
    if (!root) {
        return null;
    }
    const optIn = root.Tags.find((t) => t.Name === 'mjValidate');
    return {
        SourceFile: sourceFile,
        Declarations: declarations,
        RootName: rootName,
        OptedIn: optIn !== undefined,
        Severity: optIn !== undefined && /^warn/i.test(optIn.Text) ? 'Warning' : 'Failure',
    };
}

/** The properties of a declaration (interface members, or the literal of `type X = { ... }`), own only. */
export function GetOwnMembers(decl: JSONDeclaration): JSONMember[] {
    const members: ReadonlyArray<ts.TypeElement> = ts.isInterfaceDeclaration(decl.Node)
        ? decl.Node.members
        : ts.isTypeLiteralNode(decl.Node.type) ? decl.Node.type.members : [];
    const result: JSONMember[] = [];
    for (const member of members) {
        if (ts.isPropertySignature(member) && member.type && (ts.isIdentifier(member.name) || ts.isStringLiteral(member.name))) {
            result.push({
                Name: member.name.text,
                Optional: member.questionToken !== undefined,
                TypeNode: member.type,
                Tags: ReadJSDocTags(member),
            });
        }
    }
    return result;
}

/** Local declarations a declaration extends (`interface A extends B, C`), in order. Non-local bases are skipped. */
export function GetLocalBases(model: JSONTypeModel, decl: JSONDeclaration): JSONDeclaration[] {
    if (!ts.isInterfaceDeclaration(decl.Node)) {
        return [];
    }
    const bases: JSONDeclaration[] = [];
    for (const clause of decl.Node.heritageClauses ?? []) {
        for (const expression of clause.types) {
            if (ts.isIdentifier(expression.expression)) {
                const base = model.Declarations.get(expression.expression.text);
                if (base) {
                    bases.push(base);
                }
            }
        }
    }
    return bases;
}

/** Every local ancestor (transitive) of a declaration, nearest first, without duplicates. */
export function GetAncestors(model: JSONTypeModel, decl: JSONDeclaration, seen: Set<string> = new Set()): JSONDeclaration[] {
    const result: JSONDeclaration[] = [];
    for (const base of GetLocalBases(model, decl)) {
        if (seen.has(base.Name)) {
            continue;
        }
        seen.add(base.Name);
        result.push(base, ...GetAncestors(model, base, seen));
    }
    return result;
}

/** Members of a declaration including those inherited from local bases (own members win). */
export function GetAllMembers(model: JSONTypeModel, decl: JSONDeclaration): JSONMember[] {
    const byName = new Map<string, JSONMember>();
    for (const ancestor of [...GetAncestors(model, decl)].reverse()) {
        for (const member of GetOwnMembers(ancestor)) {
            byName.set(member.Name, member);
        }
    }
    for (const member of GetOwnMembers(decl)) {
        byName.set(member.Name, member);
    }
    return [...byName.values()];
}

/** Tag names CodeGen reads; a comment carrying one of them that is attached to nothing is almost certainly a mistake. */
const RECOGNIZED_TAGS = ['mjValidate', 'CHECK', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf', 'minLength', 'maxLength', 'pattern', 'minItems', 'maxItems', 'uniqueItems', 'format'];

/**
 * JSDoc comments that carry a recognized tag but are attached to no declaration or member, so their
 * tags are silently unread. TypeScript attaches a `/** *\/` comment to the node that follows it only
 * when the comment starts on a line of its own (or follows a `;`/`,`); one written on the same line as
 * the opening `{` belongs to that token instead. Returns a short excerpt of each such comment.
 */
export function FindUnattachedTagComments(model: JSONTypeModel): string[] {
    const attached = new Set<number>();
    const collect = (node: ts.Node): void => {
        const docs = (node as ts.Node & { jsDoc?: ts.JSDoc[] }).jsDoc;
        docs?.forEach((d) => attached.add(d.getStart(model.SourceFile)));
        node.forEachChild(collect);
    };
    collect(model.SourceFile);
    const orphans: string[] = [];
    const pattern = /\/\*\*[\s\S]*?\*\//g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(model.SourceFile.text)) !== null) {
        const carriesTag = RECOGNIZED_TAGS.some((t) => new RegExp(`@${t}\\b`).test(match![0]));
        if (carriesTag && !attached.has(match.index)) {
            orphans.push(match[0].replace(/\s+/g, ' ').slice(0, 80));
        }
    }
    return orphans;
}

/**
 * Names of the declarations reachable from the root through type references and `extends`,
 * in declaration order. Unreachable declarations get no schema const: nothing would use it, and an
 * unused module-level const fails a consumer's `noUnusedLocals`.
 */
export function GetReachableDeclarations(model: JSONTypeModel): JSONDeclaration[] {
    const reachable = new Set<string>();
    const visit = (name: string): void => {
        if (reachable.has(name) || !model.Declarations.has(name)) {
            return;
        }
        reachable.add(name);
        const collect = (node: ts.Node): void => {
            if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName)) {
                visit(node.typeName.text);
            } else if (ts.isExpressionWithTypeArguments(node) && ts.isIdentifier(node.expression)) {
                visit(node.expression.text);
            }
            node.forEachChild(collect);
        };
        collect(model.Declarations.get(name)!.Node);
    };
    visit(model.RootName);
    return [...model.Declarations.values()].filter((d) => reachable.has(d.Name));
}

/* ------------------------------------------------------------------------------------------------
 * Type-node helpers
 * ---------------------------------------------------------------------------------------------- */

/** Strips parentheses and drops `null` / `undefined` union members. Returns the remaining node(s). */
export function StripNullish(node: ts.TypeNode): ts.TypeNode[] {
    const inner = ts.isParenthesizedTypeNode(node) ? node.type : node;
    if (ts.isUnionTypeNode(inner)) {
        return inner.types.flatMap((t) => StripNullish(t)).filter((t) => !IsNullishKeyword(t));
    }
    return IsNullishKeyword(inner) ? [] : [inner];
}

function IsNullishKeyword(node: ts.TypeNode): boolean {
    if (node.kind === ts.SyntaxKind.UndefinedKeyword || node.kind === ts.SyntaxKind.NullKeyword) {
        return true;
    }
    return ts.isLiteralTypeNode(node) && node.literal.kind === ts.SyntaxKind.NullKeyword;
}

/** True when a type node (ignoring null/undefined) is an array type; returns the element node too. */
export function GetArrayElementType(node: ts.TypeNode): ts.TypeNode | null {
    const parts = StripNullish(node);
    if (parts.length !== 1) {
        return null;
    }
    const part = parts[0];
    if (ts.isArrayTypeNode(part)) {
        return part.elementType;
    }
    if (ts.isTypeOperatorNode(part) && part.operator === ts.SyntaxKind.ReadonlyKeyword && ts.isArrayTypeNode(part.type)) {
        return part.type.elementType;
    }
    if (ts.isTypeReferenceNode(part) && ts.isIdentifier(part.typeName)
        && (part.typeName.text === 'Array' || part.typeName.text === 'ReadonlyArray') && part.typeArguments?.length === 1) {
        return part.typeArguments[0];
    }
    return null;
}

/** Name of the single local declaration a type node refers to (through `| null`, `[]`, `Record<string, T>`), with its shape. */
export function ResolveLocalTarget(model: JSONTypeModel, node: ts.TypeNode): { Name: string; Shape: 'object' | 'array' | 'record' } | null {
    const element = GetArrayElementType(node);
    if (element) {
        const inner = ResolveLocalTarget(model, element);
        return inner && inner.Shape === 'object' ? { Name: inner.Name, Shape: 'array' } : null;
    }
    const parts = StripNullish(node);
    if (parts.length !== 1) {
        return null;
    }
    const part = parts[0];
    if (ts.isTypeReferenceNode(part) && ts.isIdentifier(part.typeName)) {
        if (part.typeName.text === 'Record' && part.typeArguments?.length === 2) {
            const inner = ResolveLocalTarget(model, part.typeArguments[1]);
            return inner && inner.Shape === 'object' ? { Name: inner.Name, Shape: 'record' } : null;
        }
        if (!part.typeArguments && model.Declarations.has(part.typeName.text)) {
            return { Name: part.typeName.text, Shape: 'object' };
        }
    }
    return null;
}

/**
 * Text of a type node with references to local declarations replaced by their prefixed names.
 * Used wherever a type is spelled out in generated code (rule parameter types, `z.custom<T>()`).
 */
export function PrefixedTypeText(model: JSONTypeModel, node: ts.TypeNode, prefix: string): string {
    const source = model.SourceFile.text;
    const start = node.getStart(model.SourceFile);
    // Every top-level declared name, not just `Declarations`: enums and classes are prefixed by
    // RewriteJSONTypeDefinition too, so a reference to one must be spelled with the prefix here.
    const declared = topLevelTypeNames(model.SourceFile);
    const edits: Array<{ Start: number; End: number; Text: string }> = [];
    const visit = (n: ts.Node): void => {
        if (ts.isIdentifier(n) && declared.has(n.text) && isTypeNameReference(n)) {
            edits.push({ Start: n.getStart(model.SourceFile), End: n.getEnd(), Text: `${prefix}_${n.text}` });
        }
        n.forEachChild(visit);
    };
    visit(node);
    let text = source.slice(start, node.getEnd());
    for (const edit of edits.sort((a, b) => b.Start - a.Start)) {
        text = text.slice(0, edit.Start - start) + edit.Text + text.slice(edit.End - start);
    }
    return text;
}

function isTopLevelTypeDeclaration(node: ts.Node): node is ts.InterfaceDeclaration | ts.TypeAliasDeclaration | ts.EnumDeclaration | ts.ClassDeclaration {
    return ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isEnumDeclaration(node) || ts.isClassDeclaration(node);
}

/** Names of the definition's top-level interfaces, type aliases, enums and classes — the names the prefix rewrite renames. */
function topLevelTypeNames(sourceFile: ts.SourceFile): Set<string> {
    const declared = new Set<string>();
    sourceFile.forEachChild((node) => {
        if (isTopLevelTypeDeclaration(node) && node.name) {
            declared.add(node.name.text);
        }
    });
    return declared;
}

/** True when the identifier names a type (a type reference, `extends`, `typeof`, or the left of `A.B`) rather than a member. */
function isTypeNameReference(id: ts.Identifier): boolean {
    const parent = id.parent;
    return (ts.isTypeReferenceNode(parent) && parent.typeName === id)
        || (ts.isExpressionWithTypeArguments(parent) && parent.expression === id)
        || (ts.isTypeQueryNode(parent) && parent.exprName === id)
        || (ts.isQualifiedName(parent) && parent.left === id);
}

/* ------------------------------------------------------------------------------------------------
 * Prefix rewrite (AST based)
 * ---------------------------------------------------------------------------------------------- */

/**
 * Prefixes every top-level declared type name with `${prefix}_`, editing only identifiers — the
 * declaration names and the places that refer to them (type references, `extends`, `typeof`). Text
 * inside comments (JSDoc tag bodies, `@CHECK` expressions) and member names that merely coincide
 * with a type name are left alone, unlike a `\b` regex over the whole text.
 */
export function RewriteJSONTypeDefinition(definition: string, prefix: string): string {
    const sourceFile = ts.createSourceFile('jsontype-rewrite.ts', definition, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const declared = topLevelTypeNames(sourceFile);
    const edits: Array<{ Start: number; End: number; Insert?: string }> = [];
    // Opted-in declarations are always exported: the generated, exported structural schema consts
    // (`z.ZodType<Prefixed_X>`) name them, and an exported const may not use a private type name
    // when the package emits declarations.
    sourceFile.forEachChild((node) => {
        const isDeclaration = isTopLevelTypeDeclaration(node);
        const exported = ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
        if (isDeclaration && !exported) {
            const start = node.getStart(sourceFile);
            edits.push({ Start: start, End: start, Insert: 'export ' });
        }
    });
    const isDeclarationName = (id: ts.Identifier): boolean => {
        const parent = id.parent;
        return isTopLevelTypeDeclaration(parent) && parent.name === id;
    };
    const visit = (node: ts.Node): void => {
        if (ts.isIdentifier(node) && declared.has(node.text) && (isDeclarationName(node) || isTypeNameReference(node))) {
            edits.push({ Start: node.getStart(sourceFile), End: node.getEnd() });
        }
        node.forEachChild(visit);
    };
    visit(sourceFile);
    let text = definition;
    for (const edit of edits.sort((a, b) => b.Start - a.Start)) {
        const replacement = edit.Insert ?? `${prefix}_${text.slice(edit.Start, edit.End)}`;
        text = `${text.slice(0, edit.Start)}${replacement}${text.slice(edit.End)}`;
    }
    return text;
}

/* ------------------------------------------------------------------------------------------------
 * @CHECK rules
 * ---------------------------------------------------------------------------------------------- */

/** One `@CHECK` tag resolved to where it applies. */
export interface JSONCheckRule {
    /** `ts`: a TypeScript boolean expression, compiled directly. `sql`: translated by an LLM and cached. */
    Kind: 'ts' | 'sql';
    /** The expression text as written (`ts:` prefix removed for TypeScript rules). */
    Expression: string;
    /** Declaration the tag is on (for a property-level tag, the declaration owning the property). */
    DeclarationName: string;
    /** Property the tag is on; absent for interface-level tags. */
    Property?: string;
    /** True when the property is array-typed: the rule runs against each element. */
    PerElement: boolean;
    /** The type the rule's `value` parameter has: the declaration, or the array element type. Original (un-prefixed) names. */
    ValueTypeNode: ts.TypeNode | null;
    /** Whitespace-normalized expression, part of the cache key. */
    NormalizedText: string;
    /** `<Declaration>` or `<Declaration>.<property>`. Part of the cache key. */
    Path: string;
}

/** Collapses runs of whitespace so re-flowing a tag does not look like an edit. */
export function NormalizeCheckText(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
}

/**
 * Cache key of a SQL `@CHECK`: JSONType name + path + normalized text + a hash of the SHAPE of the
 * rule's `value` (its members' names, optionality and types). A type shared by several fields or
 * entities translates once, and editing an unrelated member, a comment or whitespace does not
 * regenerate; but two entities that declare a same-named type with different members do not share a
 * translation compiled against the other's shape. A rule that reads `row.<Column>` also keys on the
 * owning entity, whose columns it depends on.
 */
export function BuildJSONCheckKey(model: JSONTypeModel, rule: JSONCheckRule, entityName: string): string {
    const shapeHash = crypto.createHash('sha256').update(JSONCheckValueShape(model, rule)).digest('hex').slice(0, 12);
    const key = `${model.RootName}|${rule.Path}|${rule.NormalizedText}|${shapeHash}`;
    return JSONCheckReadsRow(rule) ? `${key}|${entityName}` : key;
}

/** Canonical text of the members a rule's `value` has (or of its type, when it is not a local object type). */
export function JSONCheckValueShape(model: JSONTypeModel, rule: JSONCheckRule): string {
    const target = rule.ValueTypeNode ? ResolveLocalTarget(model, rule.ValueTypeNode)?.Name : rule.DeclarationName;
    const decl = target ? model.Declarations.get(target) : undefined;
    if (!decl) {
        return NormalizeCheckText(rule.ValueTypeNode ? rule.ValueTypeNode.getText(model.SourceFile) : rule.DeclarationName);
    }
    return GetAllMembers(model, decl)
        .map((m) => `${m.Name}${m.Optional ? '?' : ''}:${NormalizeCheckText(m.TypeNode.getText(model.SourceFile))}`)
        .join(';');
}

/** True when a rule's text references the owning record (`row.<Column>`). */
export function JSONCheckReadsRow(rule: Pick<JSONCheckRule, 'NormalizedText'>): boolean {
    return /\brow\s*\./i.test(rule.NormalizedText);
}

function parseCheckTag(text: string): { Kind: 'ts' | 'sql'; Expression: string } | null {
    const trimmed = text.trim();
    if (trimmed.length === 0) {
        return null;
    }
    const tsMatch = /^ts\s*:\s*([\s\S]+)$/i.exec(trimmed);
    if (tsMatch) {
        return { Kind: 'ts', Expression: tsMatch[1].trim() };
    }
    return { Kind: 'sql', Expression: trimmed };
}

/**
 * Collects every `@CHECK` tag reachable from the root, in a deterministic order (declaration order,
 * interface-level tags before property-level tags).
 *
 * A tag on a base interface is inherited by every local interface that extends it, so the rule is
 * attached (again) to each derived declaration — that is how the runtime type graph, which visits
 * values by their declared type, finds it.
 */
export function CollectJSONCheckRules(model: JSONTypeModel): JSONCheckRule[] {
    const rules: JSONCheckRule[] = [];
    for (const decl of model.Declarations.values()) {
        const lineage = [decl, ...GetAncestors(model, decl)];
        for (const source of lineage) {
            addInterfaceRules(rules, decl, source);
        }
        for (const member of GetAllMembers(model, decl)) {
            addPropertyRules(rules, decl, member);
        }
    }
    return rules;
}

function addInterfaceRules(rules: JSONCheckRule[], target: JSONDeclaration, source: JSONDeclaration): void {
    for (const tag of source.Tags.filter((t) => t.Name === 'CHECK')) {
        const parsed = parseCheckTag(tag.Text);
        if (!parsed) {
            continue;
        }
        // Path names the declaring type for SQL (cache key follows the text's home), the target for scope.
        const normalized = NormalizeCheckText(parsed.Expression);
        rules.push({
            Kind: parsed.Kind,
            Expression: parsed.Expression,
            DeclarationName: target.Name,
            PerElement: false,
            ValueTypeNode: null,
            NormalizedText: normalized,
            Path: source.Name,
        });
    }
}

function addPropertyRules(rules: JSONCheckRule[], owner: JSONDeclaration, member: JSONMember): void {
    for (const tag of member.Tags.filter((t) => t.Name === 'CHECK')) {
        const parsed = parseCheckTag(tag.Text);
        if (!parsed) {
            continue;
        }
        const element = GetArrayElementType(member.TypeNode);
        rules.push({
            Kind: parsed.Kind,
            Expression: parsed.Expression,
            DeclarationName: owner.Name,
            Property: member.Name,
            PerElement: element !== null,
            ValueTypeNode: element,
            NormalizedText: NormalizeCheckText(parsed.Expression),
            Path: `${owner.Name}.${member.Name}`,
        });
    }
}
