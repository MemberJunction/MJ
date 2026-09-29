/**
 * @fileoverview Converts an opted-in JSONType definition (TypeScript AST) into Zod source.
 *
 * Emitted per declared interface / type alias `X` of a definition prefixed with `P`:
 *
 * ```ts
 * const P_XSchema: z.ZodType<P_X> = z.lazy(() => z.object({ ... }));
 * ```
 *
 * Every local type is wrapped in `z.lazy`, so references between declarations — including
 * recursion — need no ordering, and the output depends only on the definition text (deterministic,
 * which the codegen-drift gate requires).
 *
 * Constructs with no Zod translation never fail the run: that sub-tree becomes `z.custom<T>()` — no
 * runtime check, exactly like `z.unknown()`, but carrying the declared TypeScript type so the
 * `z.ZodType<P_X>` annotation and the entity's `z.infer` type stay correct — and a warning is
 * reported to the caller.
 *
 * @module Misc/json-type-zod
 */

import ts from 'typescript';
import {
    GetLocalBases,
    GetReachableDeclarations,
    GetOwnMembers,
    JSONDocTag,
    JSONMember,
    JSONTypeModel,
    PrefixedTypeText,
    StripNullish,
} from './json-type-model';

/** Result of converting a definition. */
export interface JSONZodResult {
    /** Source of every `const P_XSchema: ... = ...;` line, one per declaration, blank-line separated (exported, so consumers can `z.infer`/`safeParse` the object shape). */
    Source: string;
    /** Constructs that were downgraded to `z.custom<T>()`, for the caller to report. */
    Warnings: string[];
}

/** Name of the emitted schema const for a declared type. */
export function JSONSchemaConstName(prefix: string, declaredName: string): string {
    return `${prefix}_${declaredName}Schema`;
}

/** Converts an opted-in model to Zod source. */
export function GenerateJSONTypeZod(model: JSONTypeModel, prefix: string): JSONZodResult {
    const converter = new ZodConverter(model, prefix);
    const lines: string[] = [];
    for (const decl of GetReachableDeclarations(model)) {
        lines.push(converter.EmitDeclaration(decl.Name));
    }
    return { Source: lines.join('\n\n'), Warnings: converter.Warnings };
}

function hasTag(tags: JSONDocTag[], name: string): boolean {
    return tags.some((t) => t.Name === name);
}

/** The JSON Schema `format` values with a Zod string check. */
const STRING_FORMATS: Record<string, string> = {
    email: '.email()',
    uri: '.url()',
    url: '.url()',
    uuid: '.uuid()',
    'date-time': '.datetime({ offset: true })',
    date: '.date()',
};

class ZodConverter {
    public readonly Warnings: string[] = [];

    constructor(private readonly model: JSONTypeModel, private readonly prefix: string) {}

    public EmitDeclaration(name: string): string {
        const decl = this.model.Declarations.get(name)!;
        const constName = JSONSchemaConstName(this.prefix, name);
        const typeName = `${this.prefix}_${name}`;
        const typeParams = decl.Node.typeParameters;
        if (typeParams && typeParams.length > 0) {
            this.warn(`${name}: generic declarations are not converted to Zod`);
            return `export const ${constName}: z.ZodTypeAny = z.unknown();`;
        }
        const body = ts.isInterfaceDeclaration(decl.Node)
            ? this.interfaceExpression(name)
            : this.typeExpression(decl.Node.type, `${name}`, []);
        if (this.hasRequiredUnknownMember(decl.Node)) {
            this.warn(`${name}: has required members typed unknown/any/undefined; Zod always infers those as optional, so this schema is typed loosely (z.ZodTypeAny) and its inferred type is any`);
            return `export const ${constName}: z.ZodTypeAny = z.lazy(() => ${body});`;
        }
        return `export const ${constName}: z.ZodType<${typeName}> = z.lazy(() => ${body});`;
    }

    /**
     * True when the declaration (anywhere in its body) has a REQUIRED property whose type is or
     * includes `unknown`, `any` or `undefined`. Zod's inference makes every such key optional, so the
     * `z.ZodType<Interface>` annotation cannot hold and the const is typed loosely instead.
     */
    private hasRequiredUnknownMember(node: ts.Node): boolean {
        let found = false;
        const visit = (n: ts.Node): void => {
            if (ts.isPropertySignature(n) && !n.questionToken && n.type && typeAdmitsUndefined(n.type)) {
                found = true;
            }
            if (!found) {
                n.forEachChild(visit);
            }
        };
        visit(node);
        return found;
    }

    private warn(message: string): void {
        this.Warnings.push(message);
    }

    /**
     * A numeric tag's value. Tag text is free-form, so only a finite JS number is accepted — nothing
     * else can reach generated code. A tag that is present but not numeric is reported and ignored.
     */
    private numericTag(tags: JSONDocTag[], name: string, where: string): number | null {
        const tag = tags.find((t) => t.Name === name);
        if (!tag) {
            return null;
        }
        const value = Number(tag.Text.split(/\s+/)[0]);
        if (!Number.isFinite(value)) {
            this.warn(`${where}: @${name} expects a number but was '${tag.Text}'; ignored`);
            return null;
        }
        return value;
    }

    private custom(node: ts.TypeNode, where: string, why: string): string {
        this.warn(`${where}: ${why}; no runtime check is generated for it`);
        return `z.custom<${PrefixedTypeText(this.model, node, this.prefix)}>()`;
    }

    /** `z.object({...})` for an interface, joined with its local bases via `.and(...)`. */
    private interfaceExpression(name: string): string {
        const decl = this.model.Declarations.get(name)!;
        const base = this.objectFromMembers(GetOwnMembers(decl), name, decl.Node as ts.InterfaceDeclaration);
        const bases = GetLocalBases(this.model, decl).map((b) => JSONSchemaConstName(this.prefix, b.Name));
        return bases.reduce((acc, b) => `${acc}.and(${b})`, base);
    }

    private objectFromMembers(members: JSONMember[], where: string, host: ts.InterfaceDeclaration | ts.TypeLiteralNode): string {
        const entries = members.map((m) => `${JSON.stringify(m.Name)}: ${this.memberExpression(m, where)}`);
        const index = host.members.find((m): m is ts.IndexSignatureDeclaration => ts.isIndexSignatureDeclaration(m));
        const shape = entries.length > 0 ? `z.object({ ${entries.join(', ')} })` : 'z.object({})';
        if (!index) {
            return shape;
        }
        const valueExpr = index.type ? this.typeExpression(index.type, `${where}[index]`, []) : 'z.unknown()';
        return entries.length > 0 ? `${shape}.catchall(${valueExpr})` : `z.record(z.string(), ${valueExpr})`;
    }

    private memberExpression(member: JSONMember, where: string): string {
        const here = `${where}.${member.Name}`;
        let expr = this.typeExpression(member.TypeNode, here, member.Tags);
        if (member.Optional) {
            expr += '.optional()';
        }
        return expr;
    }

    /**
     * Converts a type node. `tags` are the JSDoc tags of the member the node belongs to; they are
     * applied to the node's base string/number/array schema, before `.nullable()` / `.optional()`.
     */
    private typeExpression(node: ts.TypeNode, where: string, tags: JSONDocTag[]): string {
        const parts = StripNullish(node);
        const nullable = containsNull(node);
        const optionalOnly = hasUndefinedMember(node);
        let expr: string;
        if (parts.length === 0) {
            return nullable ? 'z.null()' : 'z.undefined()';
        } else if (parts.length === 1) {
            expr = this.singleExpression(parts[0], where, tags);
        } else {
            expr = this.unionExpression(parts, where);
        }
        if (nullable) {
            expr += '.nullable()';
        }
        if (optionalOnly) {
            expr += '.optional()';
        }
        return expr;
    }

    private unionExpression(parts: ts.TypeNode[], where: string): string {
        return `z.union([${parts.map((p) => this.singleExpression(p, where, [])).join(', ')}])`;
    }

    private singleExpression(node: ts.TypeNode, where: string, tags: JSONDocTag[]): string {
        switch (node.kind) {
            case ts.SyntaxKind.StringKeyword: return this.applyStringTags('z.string()', where, tags);
            case ts.SyntaxKind.NumberKeyword: return this.applyNumberTags('z.number()', where, tags);
            case ts.SyntaxKind.BooleanKeyword: return this.warnUnusedTags('z.boolean()', where, tags);
            case ts.SyntaxKind.UnknownKeyword: return 'z.unknown()';
            case ts.SyntaxKind.AnyKeyword: return 'z.any()';
            case ts.SyntaxKind.NullKeyword: return 'z.null()';
            case ts.SyntaxKind.UndefinedKeyword: return 'z.undefined()';
            default: return this.compositeExpression(node, where, tags);
        }
    }

    private compositeExpression(node: ts.TypeNode, where: string, tags: JSONDocTag[]): string {
        if (ts.isParenthesizedTypeNode(node)) {
            return this.typeExpression(node.type, where, tags);
        }
        if (ts.isLiteralTypeNode(node)) {
            return this.literalExpression(node, where);
        }
        if (ts.isUnionTypeNode(node)) {
            return this.unionExpression(StripNullish(node), where);
        }
        if (ts.isArrayTypeNode(node)) {
            return this.arrayExpression(node.elementType, where, tags);
        }
        if (ts.isTypeOperatorNode(node) && node.operator === ts.SyntaxKind.ReadonlyKeyword && ts.isArrayTypeNode(node.type)) {
            return this.arrayExpression(node.type.elementType, where, tags);
        }
        if (ts.isTypeLiteralNode(node)) {
            return this.objectFromMembers(this.literalMembers(node), where, node);
        }
        if (ts.isTupleTypeNode(node)) {
            return this.tupleExpression(node, where);
        }
        if (ts.isIntersectionTypeNode(node)) {
            return this.intersectionExpression(node, where);
        }
        if (ts.isTypeReferenceNode(node)) {
            return this.referenceExpression(node, where, tags);
        }
        return this.custom(node, where, 'this kind of type has no Zod translation');
    }

    private literalMembers(literal: ts.TypeLiteralNode): JSONMember[] {
        const members: JSONMember[] = [];
        for (const m of literal.members) {
            if (ts.isPropertySignature(m) && m.type && (ts.isIdentifier(m.name) || ts.isStringLiteral(m.name))) {
                members.push({
                    Name: m.name.text,
                    Optional: m.questionToken !== undefined,
                    TypeNode: m.type,
                    Tags: ts.getJSDocTags(m).map((t) => ({ Name: t.tagName.text, Text: (ts.getTextOfJSDocComment(t.comment) ?? '').trim() })),
                });
            }
        }
        return members;
    }

    private literalExpression(node: ts.LiteralTypeNode, where: string): string {
        const lit = node.literal;
        if (ts.isStringLiteral(lit) || ts.isNoSubstitutionTemplateLiteral(lit)) {
            return `z.literal(${JSON.stringify(lit.text)})`;
        }
        if (ts.isNumericLiteral(lit)) {
            return `z.literal(${lit.text})`;
        }
        if (ts.isPrefixUnaryExpression(lit) && lit.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(lit.operand)) {
            return `z.literal(-${lit.operand.text})`;
        }
        if (lit.kind === ts.SyntaxKind.TrueKeyword) {
            return 'z.literal(true)';
        }
        if (lit.kind === ts.SyntaxKind.FalseKeyword) {
            return 'z.literal(false)';
        }
        return this.custom(node, where, 'unsupported literal type');
    }

    private arrayExpression(element: ts.TypeNode, where: string, tags: JSONDocTag[]): string {
        let expr = `z.array(${this.typeExpression(element, `${where}[]`, [])})`;
        const min = this.numericTag(tags, 'minItems', where);
        const max = this.numericTag(tags, 'maxItems', where);
        if (min !== null) {
            expr += `.min(${min})`;
        }
        if (max !== null) {
            expr += `.max(${max})`;
        }
        if (hasTag(tags, 'uniqueItems')) {
            expr += `.refine((items) => new Set(items.map((item) => JSON.stringify(item))).size === items.length, { message: 'Items must be unique' })`;
        }
        return this.warnUnusedTags(expr, where, tags, ['minItems', 'maxItems', 'uniqueItems']);
    }

    private tupleExpression(node: ts.TupleTypeNode, where: string): string {
        const plain = node.elements.every((e) => !ts.isOptionalTypeNode(e) && !ts.isRestTypeNode(e) && !ts.isNamedTupleMember(e));
        if (!plain) {
            return this.custom(node, where, 'optional/rest/named tuple members are not converted');
        }
        return `z.tuple([${node.elements.map((e, i) => this.typeExpression(e, `${where}[${i}]`, [])).join(', ')}])`;
    }

    private intersectionExpression(node: ts.IntersectionTypeNode, where: string): string {
        const [first, ...rest] = node.types.map((t) => this.typeExpression(t, where, []));
        return rest.reduce((acc, next) => `z.intersection(${acc}, ${next})`, first);
    }

    private referenceExpression(node: ts.TypeReferenceNode, where: string, tags: JSONDocTag[]): string {
        if (!ts.isIdentifier(node.typeName)) {
            return this.custom(node, where, 'qualified type names are not converted');
        }
        const name = node.typeName.text;
        const args = node.typeArguments ?? [];
        if ((name === 'Array' || name === 'ReadonlyArray') && args.length === 1) {
            return this.arrayExpression(args[0], where, tags);
        }
        if (name === 'Record' && args.length === 2) {
            return this.recordExpression(node, args, where);
        }
        if (this.model.Declarations.has(name) && args.length === 0) {
            return JSONSchemaConstName(this.prefix, name);
        }
        return this.custom(node, where, `type '${name}' is not declared in the definition or has no Zod translation`);
    }

    private recordExpression(node: ts.TypeReferenceNode, args: readonly ts.TypeNode[], where: string): string {
        const key = args[0];
        if (key.kind !== ts.SyntaxKind.StringKeyword) {
            return this.custom(node, where, 'only Record<string, T> is converted');
        }
        return `z.record(z.string(), ${this.typeExpression(args[1], `${where}[key]`, [])})`;
    }

    private applyStringTags(expr: string, where: string, tags: JSONDocTag[]): string {
        let out = expr;
        const min = this.numericTag(tags, 'minLength', where);
        const max = this.numericTag(tags, 'maxLength', where);
        if (min !== null) {
            out += `.min(${min})`;
        }
        if (max !== null) {
            out += `.max(${max})`;
        }
        const pattern = tags.find((t) => t.Name === 'pattern');
        if (pattern && pattern.Text.length > 0) {
            out += `.regex(new RegExp(${JSON.stringify(pattern.Text)}))`;
        }
        const format = tags.find((t) => t.Name === 'format');
        if (format) {
            const check = STRING_FORMATS[format.Text.trim().toLowerCase()];
            if (check) {
                out += check;
            } else {
                this.warn(`${where}: @format '${format.Text}' is not supported (email, uri, uuid, date-time, date are)`);
            }
        }
        return this.warnUnusedTags(out, where, tags, ['minLength', 'maxLength', 'pattern', 'format']);
    }

    private applyNumberTags(expr: string, where: string, tags: JSONDocTag[]): string {
        let out = expr;
        const checks: Array<[string, string]> = [
            ['minimum', 'min'], ['maximum', 'max'], ['exclusiveMinimum', 'gt'], ['exclusiveMaximum', 'lt'], ['multipleOf', 'multipleOf'],
        ];
        for (const [tag, method] of checks) {
            const value = this.numericTag(tags, tag, where);
            if (value !== null) {
                out += `.${method}(${value})`;
            }
        }
        return this.warnUnusedTags(out, where, tags, checks.map(([tag]) => tag));
    }

    /** Warns about a constraint tag that does not apply to the member's type; returns the expression unchanged. */
    private warnUnusedTags(expr: string, where: string, tags: JSONDocTag[], applied: string[] = []): string {
        const constraintTags = ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf', 'minLength', 'maxLength', 'pattern', 'format', 'minItems', 'maxItems', 'uniqueItems'];
        for (const tag of tags) {
            if (constraintTags.includes(tag.Name) && !applied.includes(tag.Name)) {
                this.warn(`${where}: @${tag.Name} does not apply to this member's type and was ignored`);
            }
        }
        return expr;
    }
}

function unparen(node: ts.TypeNode): ts.TypeNode {
    return ts.isParenthesizedTypeNode(node) ? unparen(node.type) : node;
}

/** True when the type is `null` or a union that has `null` among its members (through parentheses). */
function containsNull(node: ts.TypeNode): boolean {
    const inner = unparen(node);
    if (inner.kind === ts.SyntaxKind.NullKeyword || (ts.isLiteralTypeNode(inner) && inner.literal.kind === ts.SyntaxKind.NullKeyword)) {
        return true;
    }
    return ts.isUnionTypeNode(inner) && inner.types.some((t) => containsNull(t));
}

function hasUndefinedMember(node: ts.TypeNode): boolean {
    const inner = unparen(node);
    if (!ts.isUnionTypeNode(inner)) {
        return false;
    }
    return inner.types.some((t) => unparen(t).kind === ts.SyntaxKind.UndefinedKeyword || hasUndefinedMember(t));
}

/** True when a type is, or is a union containing, `unknown`, `any` or `undefined` (through parentheses). */
function typeAdmitsUndefined(node: ts.TypeNode): boolean {
    const inner = unparen(node);
    if (inner.kind === ts.SyntaxKind.UnknownKeyword || inner.kind === ts.SyntaxKind.AnyKeyword || inner.kind === ts.SyntaxKind.UndefinedKeyword) {
        return true;
    }
    return ts.isUnionTypeNode(inner) && inner.types.some((t) => typeAdmitsUndefined(t));
}
