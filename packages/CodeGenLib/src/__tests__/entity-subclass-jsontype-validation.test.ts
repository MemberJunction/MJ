/**
 * JSONType opt-in validation in CodeGen: `@mjValidate`, structural Zod, `@CHECK` rules, the SQL
 * `@CHECK` cache, and — as important — that everything WITHOUT a tag is unchanged.
 *
 * What is asserted, in order:
 *  1. Untagged JSONTypes: output identical to golden output captured from the generator as it was
 *     BEFORE this feature, except the accessor block (which now delegates to core — an intentional
 *     change for every JSONType field, because it fixes in-place edits being lost).
 *  2. Opted-in emission: schema consts, entity schema, `Validate()`.
 *  3. TS AST -> Zod mapping, checked three ways: emitted text, TYPE-CHECKED by the TypeScript
 *     compiler against real zod, and EXECUTED against valid/invalid values.
 *  4. JSDoc tags -> Zod constraints; unsupported constructs -> `z.custom<T>()` + a warning.
 *  5. `@CHECK ts:` and SQL `@CHECK` rules, including the LLM cache contract with a stubbed model.
 *  6. The type-prefix rewrite leaves tag bodies alone.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

vi.mock('@memberjunction/core', () => ({
    BaseEntity: class BaseEntity {},
    EntityFieldInfo: class {},
    EntityFieldValueListType: { None: 'None', List: 'List', ListOrUserEntry: 'ListOrUserEntry' },
    EntityInfo: class {},
    Metadata: class { EntityByName() { return { ID: 'e' }; } },
    TypeScriptTypeFromSQLType: vi.fn((sqlType: string) => {
        const map: Record<string, string> = { nvarchar: 'string', int: 'number', uniqueidentifier: 'string' };
        return map[sqlType.toLowerCase()] || 'string';
    }),
}));
vi.mock('mssql', () => ({ default: {} }));
vi.mock('../Misc/status_logging', () => ({ logError: vi.fn(), logStatus: vi.fn(), LogWarning: vi.fn() }));
vi.mock('../Database/manage-metadata', () => ({
    ValidatorResult: class {},
    ManageMetadataBase: class {
        static generatedValidators: unknown[] = [{
            entityName: 'Plain Entity', fieldName: 'Score', functionName: 'ValidateScoreRange', functionDescription: 'Score is 0..10',
            functionText: 'public ValidateScoreRange(result: ValidationResult) {\n\tif (this.Score < 0) { result.Errors.push(new ValidationErrorInfo("Score", "neg", this.Score, ValidationErrorType.Failure)); }\n}',
            generatedCodeId: 'g1', wasGenerated: false,
        }];
        static GeneratedJSONValidators: unknown[] = [];
    },
}));
vi.mock('../Config/config', () => ({
    MjCoreSchema: () => '__mj', configInfo: {}, ResolveEntityImportPackage: () => 'x', DbPlatform: () => 'sqlserver',
}));
vi.mock('./sql_logging', () => ({ SQLLogging: class {} }));
vi.mock('../Misc/util', () => ({ MakeDir: vi.fn(), SortBySequenceAndCreatedAt: vi.fn((i: unknown[]) => [...i]) }));

import { EntitySubClassGeneratorBase } from '../Misc/entity_subclasses_codegen';
import { LogWarning, logError } from '../Misc/status_logging';
import { ManageMetadataBase } from '../Database/manage-metadata';
import { ParseJSONTypeDefinition, RewriteJSONTypeDefinition, CollectJSONCheckRules, BuildJSONCheckKey, ReadJSDocTags, FindUnattachedTagComments } from '../Misc/json-type-model';
import { GenerateJSONTypeZod } from '../Misc/json-type-zod';
import { BuildJSONRuleSet, CompileCheckJSONRuleBody, CheckTSExpressionSyntax, RunJSONRuleTestCases } from '../Misc/json-type-rules';
import {
    CachedJSONValidator, JSONCheckStore, JSONCheckTranslator, JSONFieldRow, JSONValidatorResult, ResolveJSONCheckValidators,
} from '../Database/json-check-validators';
import { buildUntaggedEntities, makeEntity, makeField, makePrimaryKeyField, Plain } from './fixtures/jsontype-fixtures';

const req = createRequire(__filename);
const golden = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/jsontype-untagged.golden.json'), 'utf8')) as Record<string, { subclass: string; schema: string }>;

const generator = new EntitySubClassGeneratorBase();
const gen = (entity: Plain) => generator.GenerateEntitySubClass({} as never, entity as never, false, true);
const schemaOf = (entity: Plain) => generator.GenerateSchemaAndType(entity as never);

beforeEach(() => {
    vi.clearAllMocks();
    (ManageMetadataBase as unknown as { GeneratedJSONValidators: unknown[] }).GeneratedJSONValidators = [];
});

/**
 * Lets the worker's event loop turn between tests. Almost every test here is synchronous (the real
 * TypeScript compiler, generated-code evaluation), and vitest chains synchronous tests in microtasks,
 * so the worker never reads the replies to the progress updates it keeps sending. On a loaded CI
 * runner the whole file passes 60s that way, and vitest reports "Timeout calling onTaskUpdate" as an
 * unhandled error, failing the run although every test passed.
 */
afterEach(() => new Promise<void>((resolve) => setImmediate(resolve)));

/* ------------------------------------------------------------------------------------------------
 * helpers: run emitted TypeScript for real
 * ---------------------------------------------------------------------------------------------- */

/** Type-checks `source` (which may `import { z } from 'zod'`) with the real compiler. Returns messages. */
/**
 * Type-checks emitted source under BOTH strict and non-strict settings: generated code lands in
 * packages that build either way (MJCoreEntities is non-strict), and Zod's inference differs between
 * them (without strictNullChecks every object key is inferred optional).
 */
function typeCheck(source: string): string[] {
    return [...typeCheckWith(source, true), ...typeCheckWith(source, false)];
}

function typeCheckWith(source: string, strict: boolean): string[] {
    const fileName = path.join(__dirname, '__virtual_emitted__.ts');
    const options: ts.CompilerOptions = {
        noEmit: true, strict, target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler, skipLibCheck: true, types: [],
    };
    const host = ts.createCompilerHost(options);
    const original = host.getSourceFile.bind(host);
    host.getSourceFile = (name, languageVersion, onError, shouldCreate) =>
        name === fileName ? ts.createSourceFile(name, source, languageVersion, true) : original(name, languageVersion, onError, shouldCreate);
    host.fileExists = (name) => name === fileName || fs.existsSync(name);
    host.readFile = (name) => (name === fileName ? source : fs.readFileSync(name, 'utf8'));
    const program = ts.createProgram([fileName], options, host);
    return ts.getPreEmitDiagnostics(program, program.getSourceFile(fileName)).map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
}

/** Transpiles and evaluates a module, returning its exports. */
function evaluate(source: string): Record<string, unknown> {
    const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
    const exports: Record<string, unknown> = {};
    new Function('exports', 'require', outputText)(exports, req);
    return exports;
}

interface ParsedSchema { safeParse(value: unknown): { success: boolean; error?: { issues: Array<{ path: Array<string | number>; message: string }> } } }

/** Definition + its emitted Zod source, wrapped as a module exporting `Root`. */
function zodModule(definition: string, rootName: string, prefix = 'P'): { Source: string; Warnings: string[]; Module: string } {
    const model = ParseJSONTypeDefinition(definition, rootName)!;
    const converted = GenerateJSONTypeZod(model, prefix);
    const prefixed = RewriteJSONTypeDefinition(definition, prefix);
    const module = `import { z } from 'zod';\n${prefixed}\n${converted.Source}\nexport const Root = ${prefix}_${rootName}Schema;\n`;
    return { ...converted, Module: module };
}

const rootSchema = (m: { Module: string }): ParsedSchema => evaluate(m.Module).Root as ParsedSchema;

/* ------------------------------------------------------------------------------------------------
 * 1. Untagged JSONTypes are unchanged
 * ---------------------------------------------------------------------------------------------- */

describe('untagged JSONTypes: output is unchanged except the accessor delegation', () => {
    /** Collapses each field's Object accessor (old or new form) to a placeholder so everything else can be compared exactly. */
    const normalizeAccessors = (source: string): string =>
        source
            .replace(/\n\n    private _(\w+)Object_cached[\s\S]*?this\._\1Object_lastRaw = raw;\n    \}/g, '\n\n    <<ACCESSOR $1>>')
            .replace(/\n\n    \/\*\*\n    \* Typed accessor for [\s\S]*?this\.SetJSONFieldObject<[^\n]+\n    \}/g, (m) => {
                const name = /get (\w+)Object\(\)/.exec(m)![1];
                return `\n\n    <<ACCESSOR ${name}>>`;
            });

    it('an entity with untagged JSON fields matches the pre-feature golden output outside the accessor blocks', async () => {
        const entities = buildUntaggedEntities();
        const actual = await gen(entities.jsonEntity);
        expect(normalizeAccessors(actual)).toBe(normalizeAccessors(golden.jsonEntity.subclass));
    });

    it('the Zod schema of untagged JSON fields is byte-identical (z.any())', () => {
        expect(schemaOf(buildUntaggedEntities().jsonEntity)).toBe(golden.jsonEntity.schema);
        expect(golden.jsonEntity.schema).toContain('Config: z.any().nullable()');
    });

    it('an entity with no JSON fields is byte-identical in full, including its table-CHECK Validate() override', async () => {
        const entities = buildUntaggedEntities();
        (entities.plainEntity as { Name: string }).Name = 'Plain Entity';
        expect(await gen(entities.plainEntity)).toBe(golden.plainEntity.subclass);
        expect(schemaOf(entities.plainEntity)).toBe(golden.plainEntity.schema);
        expect(golden.plainEntity.subclass).toContain('result.Success = result.Success && (result.Errors.length === 0);');
    });

    it('untagged types keep the historical whole-text prefix rewrite (a property sharing a type name is renamed too)', async () => {
        const out = await gen(buildUntaggedEntities().jsonEntity);
        expect(out).toContain('TestEntityEntity_IMyConfig?: string;'); // the historical (regex) behavior, preserved on purpose
    });

    it('emits no JSON validation and no structural schema for untagged types', async () => {
        const out = await gen(buildUntaggedEntities().jsonEntity);
        expect(out).not.toContain('ValidateJSONField');
        expect(out).not.toContain('public override Validate()');
    });
});

describe('the accessor now delegates to core for EVERY JSONType field (intentional change)', () => {
    it('emits GetJSONFieldObject / SetJSONFieldObject and no private cache fields', async () => {
        const out = await gen(buildUntaggedEntities().jsonEntity);
        expect(out).toContain("return this.GetJSONFieldObject<TestEntityEntity_IMyConfig>('Config');");
        expect(out).toContain("this.SetJSONFieldObject<TestEntityEntity_IMyConfig>('Config', value);");
        expect(out).not.toMatch(/_\w+Object_cached/);
        expect(out).not.toContain('JSON.parse(raw)');
    });

    it('a non-nullable column keeps the non-null assertion the old getter had; arrays use Array<T>', async () => {
        const out = await gen(buildUntaggedEntities().jsonEntity);
        expect(out).toContain("get ItemsObject(): Array<TestEntityEntity_IMyExtra> {");
        expect(out).toContain("return this.GetJSONFieldObject<Array<TestEntityEntity_IMyExtra>>('Items')!;");
    });

    it('documents the live-view semantics in the emitted JSDoc', async () => {
        const out = await gen(buildUntaggedEntities().jsonEntity);
        expect(out).toContain('live view of the parsed JSON');
        expect(out).toContain('ToPlainJSON()');
    });
});

/* ------------------------------------------------------------------------------------------------
 * 2. Opted-in emission
 * ---------------------------------------------------------------------------------------------- */

const OPTED_IN = `/**
 * @mjValidate
 * @CHECK ts:(value.Low <= value.High)
 */
export interface IRange {
    /** @minimum 0 */
    Low: number;
    High: number;
    /**
     * @minItems 1
     * @CHECK ts:(value.length <= 3)
     */
    Tags?: string[];
    Windows: IWindow[];
    Note: string | null;
}
export interface IWindow {
    /** @CHECK ts:(value.Start < value.End) */
    Start: number;
    End: number;
}`;

function optedInEntity(definition = OPTED_IN, extra: Plain = {}): Plain {
    return makeEntity([
        makePrimaryKeyField(),
        makeField({ Name: 'Range', CodeName: 'Range', JSONType: 'IRange', JSONTypeDefinition: definition, ...extra }),
    ]);
}

describe('opted-in JSONType emission', () => {
    it('emits one lazy schema const per reachable declaration, and uses the root in the entity schema', () => {
        const out = schemaOf(optedInEntity());
        expect(out).toContain('export const TestEntityEntity_IRangeSchema = z.lazy(() =>');
        expect(out).toContain('export const TestEntityEntity_IWindowSchema = z.lazy(() =>');
        // The COLUMN entry stays exactly what an untagged field emits: the column's value is JSON TEXT
        // everywhere (Get/GetAll/LoadFromData/GraphQL), so typing it as the interface would be a lie.
        expect(out).toContain('Range: z.any().nullable().describe(');
        expect(out).not.toContain('Range: TestEntityEntity_IRangeSchema');
        // the consts still precede the entity schema, and Validate() (not the column) is what uses them
        expect(out.indexOf('export const TestEntityEntity_IRangeSchema')).toBeLessThan(out.indexOf('export const TestEntitySchema'));
    });

    it('an array-typed field keeps a z.any() column; the array wrapper appears only in Validate()', async () => {
        const entity = optedInEntity(OPTED_IN, { JSONTypeIsArray: true, AllowsNull: false });
        expect(schemaOf(entity)).toContain('Range: z.any().describe(');
        const out = await gen(optedInEntity(OPTED_IN, { JSONTypeIsArray: true, AllowsNull: false }));
        expect(out).toContain('this.ValidateJSONField("Range", z.array(TestEntityEntity_IRangeSchema), ');
    });

    it('the entity type of an opted-in field stays the raw column type (JSON text), not the interface', () => {
        const out = schemaOf(optedInEntity());
        expect(out).toMatch(/Range: z\.any\(\)\.nullable\(\)/);
    });

    it('generates a Validate() override that calls ValidateJSONField with the schema and rules', async () => {
        const out = await gen(optedInEntity());
        expect(out).toContain('public override Validate(): ValidationResult {');
        expect(out).toContain('const result = super.Validate();');
        expect(out).toContain(`this.ValidateJSONField("Range", TestEntityEntity_IRangeSchema, {`);
        expect(out).toContain(`}, 'Failure', result);`);
        expect(out).toContain('* * Range: JSON structure and @CHECK rules (@mjValidate)');
    });

    it('the success line counts only Failure-severity errors when JSON validation is present', async () => {
        const out = await gen(optedInEntity());
        expect(out).toContain('result.Success = result.Success && !result.Errors.some((e) => e.Type === ValidationErrorType.Failure);');
        expect(out).not.toContain('result.Success && (result.Errors.length === 0)');
    });

    it('@mjValidate warn selects Warning severity', async () => {
        const def = OPTED_IN.replace('@mjValidate', '@mjValidate warn');
        const out = await gen(optedInEntity(def));
        expect(out).toContain(`}, 'Warning', result);`);
        expect(out).toContain('(@mjValidate warn)');
    });

    it('an opted-in type with no @CHECK rules passes null rules', async () => {
        const out = await gen(optedInEntity(`/** @mjValidate */\nexport interface IRange { Low: number }`));
        expect(out).toContain(`this.ValidateJSONField("Range", TestEntityEntity_IRangeSchema, null, 'Failure', result);`);
    });

    it('merges with table-CHECK validators: super, table validators, then JSON validators', async () => {
        const entity = optedInEntity();
        (entity as { Name: string }).Name = 'Plain Entity';
        (entity.Fields as Plain[]).push(makeField({ Name: 'Score', CodeName: 'Score', Type: 'int', SQLFullType: 'int' }));
        const out = await gen(entity);
        const body = out.slice(out.indexOf('public override Validate()'));
        expect(body.indexOf('super.Validate()')).toBeLessThan(body.indexOf('this.ValidateScoreRange(result);'));
        expect(body.indexOf('this.ValidateScoreRange(result);')).toBeLessThan(body.indexOf('this.ValidateJSONField('));
        expect(out).toContain('public ValidateScoreRange(result: ValidationResult)');
    });

    it('does not validate read-only fields or IS-A parent fields mirrored onto a child', async () => {
        expect(await gen(optedInEntity(OPTED_IN, { ReadOnly: true }))).not.toContain('ValidateJSONField');
        const child = makeEntity([makePrimaryKeyField(), makeField({ Name: 'Range', CodeName: 'Range', JSONType: 'IRange', JSONTypeDefinition: OPTED_IN, IsVirtual: true, AllowUpdateAPI: true })], { IsChildType: true, ParentChain: [], ParentEntityInfo: { Name: 'Parent' } });
        expect(await gen(child)).not.toContain('ValidateJSONField');
    });

    it('output is deterministic: two generations are identical', async () => {
        const one = await gen(optedInEntity());
        const two = await gen(optedInEntity());
        expect(one).toBe(two);
        expect(schemaOf(optedInEntity())).toBe(schemaOf(optedInEntity()));
    });

    it('an invalid opted-in definition is demoted to a plain string field (no schema, no validation, no accessor)', async () => {
        const entity = optedInEntity('/** @mjValidate */\nexport interface IRange { Low: number');
        // the pipeline emits the schema section first, then the classes (which demote the field)
        expect(schemaOf(entity)).toContain('Range: z.any()');
        const out = await gen(entity);
        expect(out).not.toContain('ValidateJSONField');
        expect(out).not.toContain('RangeObject');
    });

    it('two fields sharing one definition emit its schema consts once', () => {
        const entity = makeEntity([
            makePrimaryKeyField(),
            makeField({ Name: 'A', CodeName: 'A', JSONType: 'IRange', JSONTypeDefinition: OPTED_IN }),
            makeField({ Name: 'B', CodeName: 'B', JSONType: 'IRange', JSONTypeDefinition: OPTED_IN }),
        ]);
        const out = schemaOf(entity);
        expect(out.match(/export const TestEntityEntity_IRangeSchema =/g)).toHaveLength(1);
        expect(out).toContain('A: z.any().nullable()');
        expect(out).toContain('B: z.any().nullable()');
    });

    it('one definition bound to an opted-in root AND an untagged root emits its declarations once', async () => {
        const def = `/** @mjValidate */\nexport interface IA { N: number }\ninterface IB { S: string }`;
        const entity = makeEntity([
            makePrimaryKeyField(),
            makeField({ Name: 'A', CodeName: 'A', JSONType: 'IA', JSONTypeDefinition: def }),
            makeField({ Name: 'B', CodeName: 'B', JSONType: 'IB', JSONTypeDefinition: def }),
        ]);
        const out = await gen(entity);
        expect(out.match(/interface TestEntityEntity_IB\b/g)).toHaveLength(1);
        expect(out.match(/interface TestEntityEntity_IA\b/g)).toHaveLength(1);
    });

    it('a helper type reached from two different opted-in definitions emits its schema const once', () => {
        const shared = 'export interface IShared { N: number }';
        const entity = makeEntity([
            makePrimaryKeyField(),
            makeField({ Name: 'A', CodeName: 'A', JSONType: 'IA', JSONTypeDefinition: `/** @mjValidate */\nexport interface IA { S: IShared }\n${shared}` }),
            makeField({ Name: 'B', CodeName: 'B', JSONType: 'IB', JSONTypeDefinition: `/** @mjValidate */\nexport interface IB { T: IShared[] }\n${shared}` }),
        ]);
        const out = schemaOf(entity);
        expect(out.match(/export const TestEntityEntity_ISharedSchema =/g)).toHaveLength(1);
        expect(out).toContain('export const TestEntityEntity_IASchema =');
        expect(out).toContain('export const TestEntityEntity_IBSchema =');
    });

    it('the emitted schema section and class compile against real zod (whole-file type check)', async () => {
        const entity = optedInEntity();
        const schema = schemaOf(entity);
        const cls = await gen(entity);
        // Assemble like AssembleEntitySubclassFile does, with a stub BaseEntity carrying the core helpers.
        const file = `import { z } from 'zod';
declare class BaseEntity<T = unknown> {
    Get(name: string): any; Set(name: string, value: unknown): void; Validate(): ValidationResult;
    protected GetJSONFieldObject<TObject>(fieldName: string): TObject | null;
    protected SetJSONFieldObject<TObject>(fieldName: string, value: TObject | null | undefined): void;
    protected ValidateJSONField(fieldName: string, schema: z.ZodTypeAny, rules: JSONFieldRuleSet | null, severity: 'Failure' | 'Warning', result: ValidationResult): void;
}
declare class ValidationResult { Success: boolean; Errors: Array<{ Type: string }>; }
declare const ValidationErrorType: { Failure: 'Failure'; Warning: 'Warning' };
declare class ValidationErrorInfo { constructor(a: string, b: string, c: unknown, d?: string); }
declare class CompositeKey { KeyValuePairs: Array<{ FieldName: string; Value: unknown }>; }
declare function RegisterClass(base: unknown, name: string): (target: unknown) => void;
interface JSONFieldRuleSet { RootType: string; RootIsArray: boolean; Graph: Record<string, Array<{ Property: string; Type: string; Shape: 'object' | 'array' | 'record' }>>; Rules: Array<{ Type: string; Property?: string; PerElement?: boolean; Description: string; Test(value: unknown, row: BaseEntity): boolean }>; }
${schema}
${cls.replace(/@RegisterClass\(BaseEntity, 'Test Entity'\)\n/, '').replace(/private static/g, 'private static')}`;
        const problems = typeCheck(file).filter((m) => !/EntityRelationshipsToLoad|InnerLoad|Property 'InnerLoad'/.test(m));
        expect(problems).toEqual([]);
    });
});

/* ------------------------------------------------------------------------------------------------
 * 3. TS AST -> Zod, checked by type-check AND execution
 * ---------------------------------------------------------------------------------------------- */

describe('TypeScript -> Zod mapping', () => {
    const DEFINITION = `/** @mjValidate */
export interface IRoot {
    Str: string;
    Num: number;
    Bool: boolean;
    Nothing: null;
    MaybeStr: string | null;
    MaybeNum?: number;
    LitStr: 'a' | 'b';
    LitNum: 1 | 2 | 3;
    LitBool: true;
    LitNeg: -1;
    Mixed: string | number;
    Arr: string[];
    Arr2: Array<number>;
    RoArr: readonly string[];
    Rec: Record<string, number>;
    Dict: { [key: string]: boolean };
    Inline: { X: number; Y?: string };
    Tup: [string, number];
    Nested: IChild;
    Kids: IChild[];
    Self?: IRoot;
    Both: IChild & IExtra;
    Anything: unknown;
    AnyThing: any;
    Paren: (string | number)[];
    Child2: IDerived;
}
export interface IChild { Name: string }
export interface IExtra { Tag: string }
export interface IDerived extends IChild { Extra: number }
`;
    const valid = {
        Str: 's', Num: 1, Bool: true, Nothing: null, MaybeStr: null, LitStr: 'a', LitNum: 2, LitBool: true, LitNeg: -1, Mixed: 3,
        Arr: ['x'], Arr2: [1], RoArr: ['y'], Rec: { a: 1 }, Dict: { k: false }, Inline: { X: 1 }, Tup: ['t', 2],
        Nested: { Name: 'n' }, Kids: [{ Name: 'k' }], Both: { Name: 'b', Tag: 't' }, Anything: { any: 1 }, AnyThing: 5,
        Paren: ['a', 1], Child2: { Name: 'c', Extra: 1 },
    };

    it('reports a required unknown/any member as a loose-typing warning (Zod infers those keys as optional), and only that', () => {
        const warnings = zodModule(DEFINITION, 'IRoot').Warnings;
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain('IRoot');
        expect(warnings[0]).toContain('z.ZodTypeAny');
    });

    it('a definition without required unknown members converts with no warnings at all', () => {
        const clean = DEFINITION.replace('    Anything: unknown;\n', '').replace('    AnyThing: any;\n', '');
        expect(zodModule(clean, 'IRoot').Warnings).toEqual([]);
        expect(zodModule(clean, 'IRoot').Source).toMatch(/const P_IRootSchema = z\.lazy\(.*\) as z\.ZodType<P_IRoot>;/s);
    });

    it('the emitted code type-checks against real zod (z.ZodType<Interface> assertion holds for every construct, strict and non-strict)', () => {
        expect(typeCheck(zodModule(DEFINITION, 'IRoot').Module)).toEqual([]);
    });

    it('accepts a fully valid value', () => {
        expect(rootSchema(zodModule(DEFINITION, 'IRoot')).safeParse(valid).success).toBe(true);
    });

    it('accepts optional members when absent and self-recursion when present (z.lazy)', () => {
        const schema = rootSchema(zodModule(DEFINITION, 'IRoot'));
        expect(schema.safeParse({ ...valid, MaybeNum: 4, Self: { ...valid } }).success).toBe(true);
        const bad = schema.safeParse({ ...valid, Self: { ...valid, Str: 5 } });
        expect(bad.success).toBe(false);
        expect(bad.error!.issues[0].path).toEqual(['Self', 'Str']);
    });

    it.each([
        ['Str', 5, ['Str']],
        ['LitStr', 'c', ['LitStr']],
        ['LitNum', 4, ['LitNum']],
        ['LitBool', false, ['LitBool']],
        ['Mixed', true, ['Mixed']],
        ['MaybeStr', 7, ['MaybeStr']],
        ['Arr', ['a', 1], ['Arr', 1]],
        ['Rec', { a: 'x' }, ['Rec', 'a']],
        ['Inline', { X: 'no' }, ['Inline', 'X']],
        ['Tup', ['a', 'b'], ['Tup', 1]],
        ['Nested', { Name: 3 }, ['Nested', 'Name']],
        ['Kids', [{ Name: 'ok' }, { Name: 9 }], ['Kids', 1, 'Name']],
        ['Both', { Name: 'x' }, ['Both', 'Tag']],
        ['Child2', { Name: 'x' }, ['Child2', 'Extra']],
    ])('rejects a bad %s with the offending path', (member, value, path) => {
        const result = rootSchema(zodModule(DEFINITION, 'IRoot')).safeParse({ ...valid, [member]: value });
        expect(result.success).toBe(false);
        expect(result.error!.issues[0].path).toEqual(path);
    });

    it('rejects a missing required member', () => {
        const { Str, ...rest } = valid;
        void Str;
        expect(rootSchema(zodModule(DEFINITION, 'IRoot')).safeParse(rest).success).toBe(false);
    });

    it('does not reject unknown extra members (interfaces are open)', () => {
        expect(rootSchema(zodModule(DEFINITION, 'IRoot')).safeParse({ ...valid, Extra: 'x' }).success).toBe(true);
    });

    it('type aliases convert too, including unions of literals and aliases of objects', () => {
        const def = `/** @mjValidate */\nexport type IAlias = 'x' | 'y';\nexport type IObj = { A: number };`;
        const m = zodModule(def, 'IAlias');
        expect(typeCheck(m.Module)).toEqual([]);
        expect(rootSchema(m).safeParse('x').success).toBe(true);
        expect(rootSchema(m).safeParse('z').success).toBe(false);
    });

    it('emits only declarations reachable from the root (no unused consts to trip noUnusedLocals)', () => {
        const def = `/** @mjValidate */\nexport interface IRoot { A: IUsed }\nexport interface IUsed { N: number }\nexport interface IOrphan { Z: string }`;
        const out = zodModule(def, 'IRoot').Source;
        expect(out).toContain('P_IUsedSchema');
        expect(out).not.toContain('P_IOrphanSchema');
    });

    it('output for a definition depends only on its text (deterministic)', () => {
        expect(zodModule(DEFINITION, 'IRoot').Source).toBe(zodModule(DEFINITION, 'IRoot').Source);
    });

    it('an enum referenced by an opted-in type is spelled with its prefixed name (type-checks)', () => {
        const def = `/** @mjValidate */\nexport interface IRoot { C: Color; K?: Color.Red; Cs?: Color[] }\nexport enum Color { Red = 'r', Blue = 'b' }`;
        const m = zodModule(def, 'IRoot');
        expect(m.Source).not.toMatch(/z\.custom<Color/);
        expect(typeCheck(m.Module)).toEqual([]);
    });

    it('an invalid @pattern is reported and ignored at CodeGen time, never emitted', () => {
        const def = `/** @mjValidate */\nexport interface IRoot {\n  /** @pattern ^[a-z(+$ */\n  S: string;\n}`;
        const m = zodModule(def, 'IRoot');
        expect(m.Source).not.toContain('.regex(');
        expect(m.Warnings.some((w) => /@pattern .* is not a valid regular expression/.test(w))).toBe(true);
        expect(rootSchema(m).safeParse({ S: 'anything' }).success).toBe(true);
    });

    it('strings from the definition are emitted as escaped literals that still mean the same value', () => {
        const def = `/** @mjValidate */\nexport interface IRoot {\n  "a</script>b": number;\n  /** @pattern ^<x>/y$ */\n  P: string;\n  L: 'q</b>\u2028r';\n}`;
        const m = zodModule(def, 'IRoot');
        expect(m.Source).not.toMatch(/<\/script>|<x>|<\/b>|\u2028/);
        expect(typeCheck(m.Module)).toEqual([]);
        const schema = rootSchema(m);
        expect(schema.safeParse({ 'a</script>b': 1, P: '<x>/y', L: 'q</b>\u2028r' }).success).toBe(true);
        expect(schema.safeParse({ 'a</script>b': 1, P: 'nope', L: 'q</b>\u2028r' }).success).toBe(false);
    });

    it('mutually recursive declarations need no ordering', () => {
        const def = `/** @mjValidate */\nexport interface IA { B?: IB }\nexport interface IB { A?: IA; N: number }`;
        const m = zodModule(def, 'IA');
        expect(typeCheck(m.Module)).toEqual([]);
        expect(rootSchema(m).safeParse({ B: { A: { B: { N: 1 } }, N: 2 } }).success).toBe(true);
        expect(rootSchema(m).safeParse({ B: { A: { B: { N: 'x' } }, N: 2 } }).success).toBe(false);
    });
});

describe('unsupported constructs degrade to z.custom<T>() with a warning, never a failure', () => {
    const DEFINITION = `/** @mjValidate */
export interface IRoot {
    When: Date;
    Ok: string;
    Lookup: Map<string, number>;
    Big: bigint;
    Partialed: Partial<IOther>;
    Maybe?: Date | null;
}
export interface IOther { A: number }`;

    it('warns for each and keeps the declared type on the escape hatch', () => {
        const m = zodModule(DEFINITION, 'IRoot');
        expect(m.Warnings.length).toBeGreaterThanOrEqual(5);
        expect(m.Source).toContain('"When": z.custom<Date>()');
        expect(m.Source).toContain('"Lookup": z.custom<Map<string, number>>()');
        expect(m.Source).toContain('"Big": z.custom<bigint>()');
        expect(m.Source).toContain('"Partialed": z.custom<Partial<P_IOther>>()');
        expect(m.Source).toContain('"Ok": z.string()'); // the rest of the type is still converted
    });

    it('still type-checks and validates the supported sub-trees', () => {
        const m = zodModule(DEFINITION, 'IRoot');
        expect(typeCheck(m.Module)).toEqual([]);
        const schema = rootSchema(m);
        const ok = { When: 'anything', Ok: 's', Lookup: {}, Big: 1, Partialed: {} };
        expect(schema.safeParse(ok).success).toBe(true);
        expect(schema.safeParse({ ...ok, Ok: 5 }).success).toBe(false);
    });

    it('generic declarations become an unchecked z.unknown() with a warning', () => {
        const def = `/** @mjValidate */\nexport interface IRoot { Box: IBox<number> }\nexport interface IBox<T> { Value: T }`;
        const m = zodModule(def, 'IRoot');
        expect(m.Warnings.some((w) => w.includes('generic'))).toBe(true);
        expect(m.Source).toContain('const P_IBoxSchema: z.ZodTypeAny = z.unknown();');
    });

    it('the entity generator reports converter warnings through LogWarning and still emits a schema', () => {
        const entity = makeEntity([makePrimaryKeyField(), makeField({ Name: 'R', CodeName: 'R', JSONType: 'IRoot', JSONTypeDefinition: DEFINITION })]);
        const out = schemaOf(entity);
        expect(out).toContain('export const TestEntityEntity_IRootSchema');
        expect(out).toContain('R: z.any().nullable()');
        expect(vi.mocked(LogWarning)).toHaveBeenCalled();
        expect(vi.mocked(LogWarning).mock.calls[0][0]).toContain('[JSONType] Test Entity.R');
    });
});

/* ------------------------------------------------------------------------------------------------
 * 4. JSDoc tags -> Zod constraints
 * ---------------------------------------------------------------------------------------------- */

describe('standard JSON-Schema tags map to Zod constraints', () => {
    const DEFINITION = `/** @mjValidate */
export interface ITags {
    /** @minimum 0 @maximum 100 */
    Pct: number;
    /** @exclusiveMinimum 0 */
    Positive: number;
    /** @exclusiveMaximum 10 */
    Under: number;
    /** @multipleOf 5 */
    Five: number;
    /** @minLength 2 @maxLength 4 */
    Code: string;
    /** @pattern ^[A-Z]+$ */
    Upper: string;
    /** @format email */
    Email: string;
    /** @format uri */
    Site: string;
    /** @format uuid */
    Id: string;
    /** @format date-time */
    At: string;
    /** @format date */
    Day: string;
    /** @minItems 1 @maxItems 2 */
    List: string[];
    /** @uniqueItems */
    Unique: number[];
    /** @minLength 3 */
    OptionalCode?: string | null;
    /** @minimum 1 */
    NotANumber: string;
}`;
    const valid = {
        Pct: 50, Positive: 1, Under: 9, Five: 10, Code: 'abc', Upper: 'ABC', Email: 'a@b.co', Site: 'https://x.io', Id: '123e4567-e89b-12d3-a456-426614174000',
        At: '2026-01-02T03:04:05Z', Day: '2026-01-02', List: ['a'], Unique: [1, 2], NotANumber: 'x',
    };

    it('type-checks and accepts a valid value', () => {
        const m = zodModule(DEFINITION, 'ITags');
        expect(typeCheck(m.Module)).toEqual([]);
        expect(rootSchema(m).safeParse(valid).success).toBe(true);
    });

    it.each([
        ['Pct', -1], ['Pct', 101], ['Positive', 0], ['Under', 10], ['Five', 7], ['Code', 'a'], ['Code', 'abcde'],
        ['Upper', 'abc'], ['Email', 'nope'], ['Site', 'nope'], ['Id', 'nope'], ['At', 'nope'], ['Day', '01/02/2026'],
        ['List', []], ['List', ['a', 'b', 'c']], ['Unique', [1, 1]], ['OptionalCode', 'ab'],
    ])('rejects %s = %j', (member, value) => {
        const result = rootSchema(zodModule(DEFINITION, 'ITags')).safeParse({ ...valid, [member]: value });
        expect(result.success).toBe(false);
        expect(result.error!.issues[0].path).toEqual([member]);
    });

    it('applies constraints before .nullable()/.optional() and leaves null/absent alone', () => {
        const m = zodModule(DEFINITION, 'ITags');
        expect(m.Source).toContain('"OptionalCode": z.string().min(3).nullable().optional()');
        const schema = rootSchema(m);
        expect(schema.safeParse({ ...valid, OptionalCode: null }).success).toBe(true);
    });

    it('warns about a constraint tag that does not apply to the member type, and ignores it', () => {
        const m = zodModule(DEFINITION, 'ITags');
        expect(m.Warnings.some((w) => w.includes('@minimum') && w.includes('NotANumber'))).toBe(true);
        expect(m.Source).toContain('"NotANumber": z.string()');
    });

    it('warns about an unsupported @format', () => {
        const m = zodModule(`/** @mjValidate */\nexport interface I {\n  /** @format hostname */\n  H: string;\n}`, 'I');
        expect(m.Warnings.some((w) => w.includes("@format 'hostname'"))).toBe(true);
    });

    it('a non-numeric value in a numeric tag is ignored, never emitted', () => {
        const m = zodModule(`/** @mjValidate */\nexport interface I {\n  /** @minimum abc */\n  N: number;\n}`, 'I');
        expect(m.Source).toContain('"N": z.number()');
        expect(m.Source).not.toContain('abc');
        expect(m.Warnings.some((w) => w.includes('@minimum expects a number'))).toBe(true);
    });

    it('tag bodies read through the AST: multi-line and mid-line @ survive', () => {
        const model = ParseJSONTypeDefinition(`/**\n * @mjValidate warn\n * @CHECK ts:(value.a\n *   && value.b) email@host mid-line\n */\nexport interface I { a: boolean; b: boolean }`, 'I')!;
        const tags = ReadJSDocTags(model.Declarations.get('I')!.Node);
        expect(tags.map((t) => t.Name)).toEqual(['mjValidate', 'CHECK']);
        expect(tags[1].Text).toContain('value.a');
        expect(tags[1].Text).toContain('&& value.b');
        expect(tags[1].Text).toContain('email@host mid-line');
        expect(model.Severity).toBe('Warning');
    });
});

/* ------------------------------------------------------------------------------------------------
 * 5a. @CHECK ts:
 * ---------------------------------------------------------------------------------------------- */

interface RuntimeRule { Type: string; Property?: string; PerElement?: boolean; Description: string; Test(value: unknown, row: unknown): boolean }
interface RuntimeRuleSet { RootType: string; RootIsArray: boolean; Graph: Record<string, Array<{ Property: string; Type: string; Shape: string }>>; Rules: RuntimeRule[] }

/** Evaluates an emitted rule-set literal (types erased by transpile). */
function evalRuleSet(source: string): RuntimeRuleSet {
    return evaluate(`export const Rules = ${source};`).Rules as RuntimeRuleSet;
}

describe('comments TypeScript does not attach to a member', () => {
    it('a tag comment on the same line as the opening brace is unread by TypeScript; CodeGen says so instead of ignoring it silently', () => {
        const entity = makeEntity([makePrimaryKeyField(), makeField({
            Name: 'R', CodeName: 'R', JSONType: 'I',
            JSONTypeDefinition: '/** @mjValidate */\nexport interface I { /** @minimum 5 */ N: number }',
        })]);
        const out = schemaOf(entity);
        expect(out).toContain('"N": z.number()'); // the tag really was not applied...
        expect(vi.mocked(LogWarning).mock.calls.some((c) => String(c[0]).includes('attached to nothing') && String(c[0]).includes('@minimum 5'))).toBe(true); // ...and that was reported
    });

    it('FindUnattachedTagComments ignores properly attached comments and comments with no recognized tag', () => {
        const model = ParseJSONTypeDefinition('/** @mjValidate */\nexport interface I {\n  /** @minimum 1 */\n  N: number;\n  /** prose only */ M: number;\n}', 'I')!;
        expect(FindUnattachedTagComments(model)).toEqual([]);
    });
});

describe('@CHECK ts:(...) rules', () => {
    const model = () => ParseJSONTypeDefinition(OPTED_IN, 'IRange')!;

    it('are collected in declaration order with their scope', () => {
        const rules = CollectJSONCheckRules(model());
        expect(rules.map((r) => `${r.Kind}|${r.Path}|${r.PerElement}|${r.NormalizedText}`)).toEqual([
            'ts|IRange|false|(value.Low <= value.High)',
            'ts|IRange.Tags|true|(value.length <= 3)', // Tags is string[]: the rule runs on each element
            'ts|IWindow.Start|false|(value.Start < value.End)',
        ]);
    });

    it('emit a rule set: interface-, property- and nested-scoped, with the graph to reach nested rules', () => {
        const built = BuildJSONRuleSet(model(), 'TestEntityEntity', 'TestEntityEntity', false, new Map(), 'E');
        expect(built.Errors).toEqual([]);
        expect(built.Missing).toEqual([]);
        expect(built.Source).toContain('RootType: "IRange"');
        expect(built.Source).toContain('"IRange": [{ Property: "Windows", Type: "IWindow", Shape: "array" }]');
        expect(built.Source).toContain('Test(value: TestEntityEntity_IRange, row: TestEntityEntity): boolean {');
        expect(built.Source).toContain('Test(value: TestEntityEntity_IWindow, row: TestEntityEntity): boolean {');
    });

    it('the emitted rule set runs: values in scope are checked, with element-level scoping', () => {
        const set = evalRuleSet(BuildJSONRuleSet(model(), 'P', 'E', false, new Map(), 'E').Source!);
        expect(set.Rules).toHaveLength(3);
        const [interfaceRule, tagsRule, windowRule] = set.Rules;
        expect(interfaceRule.Test({ Low: 1, High: 2 }, {})).toBe(true);
        expect(interfaceRule.Test({ Low: 3, High: 2 }, {})).toBe(false);
        expect(tagsRule.PerElement).toBe(true);
        expect(tagsRule.Test('abc', {})).toBe(true); // `value` is one element (a tag), not the array
        expect(tagsRule.Test('abcd', {})).toBe(false);
        expect(windowRule.Test({ Start: 1, End: 2 }, {})).toBe(true);
        expect(windowRule.Test({ Start: 2, End: 2 }, {})).toBe(false);
    });

    it('a rule on an array-typed property is per-element and its value type is the element type', () => {
        const built = BuildJSONRuleSet(ParseJSONTypeDefinition(`/** @mjValidate */\nexport interface I {\n  /** @CHECK ts:(value.length > 0) */\n  Names: string[];\n}`, 'I')!, 'P', 'E', false, new Map(), 'E');
        expect(built.Source).toContain('PerElement: true');
        expect(built.Source).toContain('Test(value: string, row: E): boolean {');
    });

    it('a rule on a base interface is attached to every local interface that extends it', () => {
        const def = `/** @mjValidate */\nexport interface IRoot { Items: IDerived[] }\n/** @CHECK ts:(value.N > 0) */\nexport interface IBase { N: number }\nexport interface IDerived extends IBase { M: number }`;
        const built = BuildJSONRuleSet(ParseJSONTypeDefinition(def, 'IRoot')!, 'P', 'E', false, new Map(), 'E');
        expect(built.Source).toContain('Type: "IDerived"');
        expect(built.Source).toContain('"IRoot": [{ Property: "Items", Type: "IDerived", Shape: "array" }]');
    });

    it('a syntactically broken ts: expression is skipped with an error, never emitted', () => {
        const def = `/** @mjValidate\n * @CHECK ts:(value.a >> ) */\nexport interface I { a: number }`;
        const built = BuildJSONRuleSet(ParseJSONTypeDefinition(def, 'I')!, 'P', 'E', false, new Map(), 'E');
        expect(built.Source).toBeNull();
        expect(built.Errors[0]).toContain('skipped');
    });

    it('a ts: expression that does not type-check against its value type is skipped with an error, never emitted', () => {
        // On a scalar property `value` is the ENCLOSING object, so `value.length` on a string member is a type error.
        const def = `/** @mjValidate */\nexport interface I {\n  /** @CHECK ts:(value.length <= 128) */\n  Name: string;\n}`;
        const built = BuildJSONRuleSet(ParseJSONTypeDefinition(def, 'I')!, 'P', 'E', false, new Map(), 'E');
        expect(built.Source).toBeNull();
        expect(built.Errors[0]).toMatch(/skipped — type error: Property 'length' does not exist/);
    });

    it('a ts: expression on a scalar property sees the enclosing object as value', () => {
        const def = `/** @mjValidate */\nexport interface I {\n  /** @CHECK ts:(value.Name.length <= 3) */\n  Name: string;\n}`;
        const built = BuildJSONRuleSet(ParseJSONTypeDefinition(def, 'I')!, 'P', 'E', false, new Map(), 'E');
        expect(built.Errors).toEqual([]);
        const rule = evalRuleSet(built.Source!).Rules[0];
        expect(rule.Test({ Name: 'abc' }, {})).toBe(true);
        expect(rule.Test({ Name: 'abcd' }, {})).toBe(false);
    });

    it('RunJSONRuleTestCases rejects a body that disagrees with its own cases', () => {
        const cases = [{ Value: { N: 1 }, Expected: true }, { Value: { N: -1 }, Expected: false }];
        expect(RunJSONRuleTestCases('return value.N > 0;', cases, false, [])).toBeNull();
        expect(RunJSONRuleTestCases('return true;', cases, false, [])).toMatch(/expected false/);
    });

    it('RunJSONRuleTestCases times out a synchronous infinite loop', () => {
        expect(RunJSONRuleTestCases('while (true) {} return true;', [{ Value: {}, Expected: true }], false, [])).toMatch(/threw/);
    });

    it('RunJSONRuleTestCases times out an infinite loop queued as a microtask instead of hanging CodeGen', () => {
        const body = 'Promise.resolve().then(() => { while (true) {} }); return true;';
        expect(RunJSONRuleTestCases(body, [{ Value: {}, Expected: true }], false, [])).toMatch(/threw/);
    });

    it('CheckTSExpressionSyntax accepts real expressions and rejects fragments', () => {
        expect(CheckTSExpressionSyntax('value.a === 1 && row.Status !== "x"')).toBeNull();
        expect(CheckTSExpressionSyntax('value.a ===')).not.toBeNull();
    });

    it('the generated entity contains the rule inline, referencing row and the prefixed value type', async () => {
        const out = await gen(optedInEntity());
        expect(out).toContain('Test(value: TestEntityEntity_IWindow, row: TestEntityEntity): boolean {');
        expect(out).toContain('return (\n');
        expect(out).toContain('value.Start < value.End');
    });

    it('row.<Column> is available to ts: rules', () => {
        const def = `/** @mjValidate\n * @CHECK ts:(value.Limit <= row.MaxLimit) */\nexport interface I { Limit: number }`;
        const built = BuildJSONRuleSet(ParseJSONTypeDefinition(def, 'I')!, 'P', 'E', false, new Map(), 'E');
        const rule = evalRuleSet(built.Source!).Rules[0];
        expect(rule.Test({ Limit: 3 }, { MaxLimit: 5 })).toBe(true);
        expect(rule.Test({ Limit: 9 }, { MaxLimit: 5 })).toBe(false);
    });

    it('the whole generated rule type-checks against the real interfaces (typed value and row)', async () => {
        const entity = optedInEntity();
        const definition = RewriteJSONTypeDefinition(OPTED_IN, 'TestEntityEntity');
        const built = BuildJSONRuleSet(model(), 'TestEntityEntity', 'TestEntityEntity', false, new Map(), 'E');
        const file = `${definition}\ndeclare class TestEntityEntity { Range: string | null }\ninterface Rules { RootType: string; RootIsArray: boolean; Graph: Record<string, Array<{ Property: string; Type: string; Shape: 'object' | 'array' | 'record' }>>; Rules: Array<{ Type: string; Property?: string; PerElement?: boolean; Description: string; Test(value: unknown, row: unknown): boolean }> }\nconst rules: Rules = ${built.Source};\nexport { rules };`;
        expect(typeCheck(file)).toEqual([]);
        void entity;
    });
});

/* ------------------------------------------------------------------------------------------------
 * 5b. compile-checking rule code
 * ---------------------------------------------------------------------------------------------- */

describe('CompileCheckJSONRuleBody: LLM output is emitted only when the compiler accepts it', () => {
    const definition = 'export interface IConfig { Pct: number; Name?: string | null }';

    it('accepts a correct body', () => {
        expect(CompileCheckJSONRuleBody(definition, 'IConfig', 'return value.Pct >= 0 && value.Pct <= 100;')).toBeNull();
    });

    it('accepts row.<Column> access', () => {
        expect(CompileCheckJSONRuleBody(definition, 'IConfig', 'return value.Pct <= row.MaxPct;')).toBeNull();
    });

    it('rejects a syntax error', () => {
        expect(CompileCheckJSONRuleBody(definition, 'IConfig', 'return value.Pct >= ;')).toContain('syntax error');
    });

    it('rejects a type error against the interface (unknown member)', () => {
        expect(CompileCheckJSONRuleBody(definition, 'IConfig', 'return value.DoesNotExist > 1;')).toContain('type error');
    });

    it('rejects a body that never returns', () => {
        expect(CompileCheckJSONRuleBody(definition, 'IConfig', 'const x = value.Pct;')).toContain('never returns');
    });

    it('rejects a template-literal placeholder (Flyway would read ${...} as a placeholder)', () => {
        expect(CompileCheckJSONRuleBody(definition, 'IConfig', 'return `${value.Pct}` !== "";')).toContain('placeholder');
    });

    it('rejects a body that returns a non-boolean', () => {
        expect(CompileCheckJSONRuleBody(definition, 'IConfig', 'return value.Pct;')).toContain('type error');
    });
});

/* ------------------------------------------------------------------------------------------------
 * 5c. SQL @CHECK: the LLM + GeneratedCode cache contract, with a stubbed model
 * ---------------------------------------------------------------------------------------------- */

const SQL_DEFINITION = `/** @mjValidate */
export interface IConfig {
    /** @CHECK (Pct >= 0 AND Pct <= 100) */
    Pct: number;
    Items: IItem[];
}
export interface IItem {
    /** @CHECK (Rate IS NULL OR Rate >= 0) */
    Rate?: number | null;
}`;

interface Harness {
    Store: JSONCheckStore & { Persisted: JSONValidatorResult[]; Loads: number };
    Translator: JSONCheckTranslator & { Calls: string[]; Enabled: boolean; Next: (checkText: string) => { Description: string; Code: string; MethodName: string; ModelID: string; TestCases?: Array<{ Value: unknown; Row?: unknown; Expected: boolean }> } | null };
    Errors: string[];
    Warnings: string[];
    Run(options: { Fields?: JSONFieldRow[]; GenerateNew: boolean }): Promise<JSONValidatorResult[]>;
}

function harness(cached: CachedJSONValidator[] = []): Harness {
    const store = {
        Persisted: [] as JSONValidatorResult[],
        Loads: 0,
        async LoadCached() { store.Loads++; return cached; },
        async Persist(entry: JSONValidatorResult) { entry.GeneratedCodeID = `id-${store.Persisted.length}`; store.Persisted.push(entry); },
    };
    const translator = {
        Calls: [] as string[],
        Enabled: true,
        Next: (checkText: string): { Description: string; Code: string; MethodName: string; ModelID: string; TestCases?: Array<{ Value: unknown; Row?: unknown; Expected: boolean }> } | null => ({
            Description: `translated ${checkText}`,
            Code: checkText.includes('Pct') ? 'return value.Pct >= 0 && value.Pct <= 100;' : 'return value.Rate == null || value.Rate >= 0;',
            MethodName: 'Rule',
            ModelID: 'model-1',
            TestCases: checkText.includes('Pct')
                ? [{ Value: { Pct: 50 }, Expected: true }, { Value: { Pct: 150 }, Expected: false }]
                : [{ Value: { Rate: 1 }, Expected: true }, { Value: { Rate: -1 }, Expected: false }, { Value: {}, Expected: true }],
        }),
        featureEnabled(name: string) { return translator.Enabled && name === 'ParseCheckConstraints'; },
        async ParseJSONCheck(checkText: string) { translator.Calls.push(checkText); return translator.Next(checkText); },
    };
    const errors: string[] = [];
    const warnings: string[] = [];
    const defaultFields: JSONFieldRow[] = [
        { Entity: 'A', Name: 'Config', JSONType: 'IConfig', JSONTypeDefinition: SQL_DEFINITION, Type: 'nvarchar', AllowsNull: true },
        { Entity: 'A', Name: 'Status', Type: 'nvarchar', AllowsNull: false },
    ];
    return {
        Store: store, Translator: translator, Errors: errors, Warnings: warnings,
        Run: (o) => ResolveJSONCheckValidators({
            Fields: o.Fields ?? defaultFields, GenerateNew: o.GenerateNew, Store: store, Translator: translator,
            CurrentUser: {} as never, ReportError: (m) => errors.push(m), ReportWarning: (m) => warnings.push(m),
        }),
    };
}

/** The cache key a rule of the default harness field (entity A, SQL_DEFINITION) resolves to. */
const keyFor = (jsonType: string, path: string, text: string, definition = SQL_DEFINITION, entity = 'A'): string => {
    const model = ParseJSONTypeDefinition(definition, jsonType)!;
    const rule = CollectJSONCheckRules(model).find((r) => r.Path === path && r.NormalizedText === text)!;
    return BuildJSONCheckKey(model, rule, entity);
};

const cachedFor = (jsonType: string, path: string, text: string, code: string): CachedJSONValidator => ({
    ID: `cached-${path}`, Source: keyFor(jsonType, path, text), Name: `Cached_${path}`, Code: code, Description: `cached ${path}`,
});

describe('SQL @CHECK on a JSONType', () => {
    it('cache MISS: calls the model once per distinct rule, compile-checks, persists, and keys on JSONType|path|text|shape', async () => {
        const h = harness();
        const results = await h.Run({ GenerateNew: true });
        expect(h.Translator.Calls).toEqual(['(Pct >= 0 AND Pct <= 100)', '(Rate IS NULL OR Rate >= 0)']);
        expect(results.map((r) => r.Key)).toEqual([
            keyFor('IConfig', 'IConfig.Pct', '(Pct >= 0 AND Pct <= 100)'),
            keyFor('IConfig', 'IItem.Rate', '(Rate IS NULL OR Rate >= 0)'),
        ]);
        expect(results.every((r) => r.WasGenerated && r.AIModelID === 'model-1')).toBe(true);
        expect(h.Store.Persisted).toHaveLength(2);
        expect(h.Errors).toEqual([]);
    });

    it('cache HIT: no model call, no persist, returns the stored code', async () => {
        const h = harness([
            cachedFor('IConfig', 'IConfig.Pct', '(Pct >= 0 AND Pct <= 100)', 'return true;'),
            cachedFor('IConfig', 'IItem.Rate', '(Rate IS NULL OR Rate >= 0)', 'return true;'),
        ]);
        const results = await h.Run({ GenerateNew: true });
        expect(h.Translator.Calls).toEqual([]);
        expect(h.Store.Persisted).toEqual([]);
        expect(results.map((r) => r.WasGenerated)).toEqual([false, false]);
        expect(results[0].FunctionText).toBe('return true;');
        expect(results[0].GeneratedCodeID).toBe('cached-IConfig.Pct');
    });

    it('--no-ai style load (GenerateNew=false): cached validators are still returned; missing ones are not generated', async () => {
        const h = harness([cachedFor('IConfig', 'IConfig.Pct', '(Pct >= 0 AND Pct <= 100)', 'return true;')]);
        const results = await h.Run({ GenerateNew: false });
        expect(results.map((r) => r.Path)).toEqual(['IConfig.Pct']); // preserved, not dropped
        expect(h.Translator.Calls).toEqual([]);
        expect(h.Warnings.some((w) => w.includes('IItem.Rate') && w.includes('generation is off'))).toBe(true);
    });

    it('the AI feature flag off behaves like --no-ai for generation but still reads the cache', async () => {
        const h = harness([cachedFor('IConfig', 'IConfig.Pct', '(Pct >= 0 AND Pct <= 100)', 'return true;')]);
        h.Translator.Enabled = false;
        const results = await h.Run({ GenerateNew: true });
        expect(results).toHaveLength(1);
        expect(h.Translator.Calls).toEqual([]);
    });

    it('changed rule text is a new key and regenerates; the old row is left alone', async () => {
        const h = harness([cachedFor('IConfig', 'IConfig.Pct', '(Pct >= 0 AND Pct <= 100)', 'return true;'), cachedFor('IConfig', 'IItem.Rate', '(Rate IS NULL OR Rate >= 0)', 'return true;')]);
        const edited = SQL_DEFINITION.replace('Pct <= 100', 'Pct <= 90');
        const results = await h.Run({
            GenerateNew: true,
            Fields: [{ Entity: 'A', Name: 'Config', JSONType: 'IConfig', JSONTypeDefinition: edited, Type: 'nvarchar', AllowsNull: true }],
        });
        expect(h.Translator.Calls).toEqual(['(Pct >= 0 AND Pct <= 90)']);
        expect(results.find((r) => r.Path === 'IConfig.Pct')!.WasGenerated).toBe(true);
        expect(results.find((r) => r.Path === 'IItem.Rate')!.WasGenerated).toBe(false);
    });

    it('re-flowing whitespace in the tag is NOT an edit (normalized text keys the cache)', async () => {
        const reflowed = SQL_DEFINITION.replace('(Pct >= 0 AND Pct <= 100)', '(Pct >= 0\n     AND   Pct <= 100)');
        const h = harness([cachedFor('IConfig', 'IConfig.Pct', '(Pct >= 0 AND Pct <= 100)', 'return true;'), cachedFor('IConfig', 'IItem.Rate', '(Rate IS NULL OR Rate >= 0)', 'return true;')]);
        await h.Run({ GenerateNew: true, Fields: [{ Entity: 'A', Name: 'Config', JSONType: 'IConfig', JSONTypeDefinition: reflowed, Type: 'nvarchar', AllowsNull: true }] });
        expect(h.Translator.Calls).toEqual([]);
    });

    it('a same-named type with DIFFERENT members on two entities translates separately', async () => {
        const h = harness();
        const other = `/** @mjValidate */\nexport interface IConfig {\n  /** @CHECK (Pct >= 0 AND Pct <= 100) */\n  Pct: number;\n  Label?: string;\n}`;
        const results = await h.Run({
            GenerateNew: true,
            Fields: [
                { Entity: 'A', Name: 'Config', JSONType: 'IConfig', JSONTypeDefinition: `/** @mjValidate */\nexport interface IConfig {\n  /** @CHECK (Pct >= 0 AND Pct <= 100) */\n  Pct: number;\n}` },
                { Entity: 'B', Name: 'Config', JSONType: 'IConfig', JSONTypeDefinition: other },
            ],
        });
        expect(h.Translator.Calls).toHaveLength(2);
        expect(new Set(results.map((r) => r.Key)).size).toBe(2);
    });

    it('a rule reading row.<Column> is translated per entity; one that does not is shared', async () => {
        const h = harness();
        h.Translator.Next = () => ({ Description: 'd', Code: 'return true;', MethodName: 'M', ModelID: 'm', TestCases: [{ Value: {}, Expected: true }] });
        const def = `/** @mjValidate */\nexport interface IQ {\n  /** @CHECK (Limit <= row.MaxLimit) */\n  Limit: number;\n  /** @CHECK (Other >= 0) */\n  Other: number;\n}`;
        await h.Run({
            GenerateNew: true,
            Fields: [
                { Entity: 'A', Name: 'Q', JSONType: 'IQ', JSONTypeDefinition: def },
                { Entity: 'B', Name: 'Q', JSONType: 'IQ', JSONTypeDefinition: def },
            ],
        });
        expect(h.Translator.Calls.filter((c) => c.includes('row.MaxLimit'))).toHaveLength(2);
        expect(h.Translator.Calls.filter((c) => c.includes('Other'))).toHaveLength(1);
    });

    it('a shared interface bound to several entity fields generates once', async () => {
        const h = harness();
        const results = await h.Run({
            GenerateNew: true,
            Fields: [
                { Entity: 'A', Name: 'Config', JSONType: 'IConfig', JSONTypeDefinition: SQL_DEFINITION },
                { Entity: 'B', Name: 'Cfg', JSONType: 'IConfig', JSONTypeDefinition: SQL_DEFINITION },
                { Entity: 'B', Name: 'Other', JSONType: 'IConfig', JSONTypeDefinition: SQL_DEFINITION },
            ],
        });
        expect(h.Translator.Calls).toHaveLength(2);
        expect(results).toHaveLength(2);
    });

    it('an un-opted-in type is ignored entirely: no cache read, no model call', async () => {
        const h = harness();
        const results = await h.Run({
            GenerateNew: true,
            Fields: [{ Entity: 'A', Name: 'Config', JSONType: 'IConfig', JSONTypeDefinition: SQL_DEFINITION.replace('@mjValidate', 'nothing') }],
        });
        expect(results).toEqual([]);
        expect(h.Store.Loads).toBe(0);
        expect(h.Translator.Calls).toEqual([]);
    });

    it('skips (and reports) model output that does not parse', async () => {
        const h = harness();
        h.Translator.Next = () => ({ Description: 'd', Code: 'return value.Pct >= ;', MethodName: 'Bad', ModelID: 'm' });
        const results = await h.Run({ GenerateNew: true });
        expect(results).toEqual([]);
        expect(h.Errors.some((e) => e.includes('rejected') && e.includes('syntax error'))).toBe(true);
        expect(h.Store.Persisted).toEqual([]); // never cache broken code
    });

    it('skips model output that does not type-check against the interface', async () => {
        const h = harness();
        h.Translator.Next = () => ({ Description: 'd', Code: 'return value.NotAMember > 1;', MethodName: 'Bad', ModelID: 'm' });
        expect(await h.Run({ GenerateNew: true })).toEqual([]);
        expect(h.Errors.some((e) => e.includes('type error'))).toBe(true);
    });

    it('skips model output that uses ${...}, and output with no return', async () => {
        const h = harness();
        h.Translator.Next = () => ({ Description: 'd', Code: 'return `${value.Pct}` !== "";', MethodName: 'Bad', ModelID: 'm' });
        expect(await h.Run({ GenerateNew: true })).toEqual([]);
        h.Translator.Next = () => ({ Description: 'd', Code: 'const x = 1;', MethodName: 'Bad', ModelID: 'm' });
        expect(await h.Run({ GenerateNew: true })).toEqual([]);
        expect(h.Errors.length).toBeGreaterThanOrEqual(4);
    });

    it('skips a model reply with missing fields, or no reply at all', async () => {
        const h = harness();
        h.Translator.Next = () => null;
        expect(await h.Run({ GenerateNew: true })).toEqual([]);
        h.Translator.Next = () => ({ Description: '', Code: 'return true;', MethodName: 'M', ModelID: 'm' });
        expect(await h.Run({ GenerateNew: true })).toEqual([]);
        expect(h.Errors.every((e) => e.includes('no usable translation'))).toBe(true);
    });

    it('partial success: one rule generated, one rejected', async () => {
        const h = harness();
        h.Translator.Next = (text) => text.includes('Pct')
            ? { Description: 'ok', Code: 'return value.Pct >= 0;', MethodName: 'Ok', ModelID: 'm', TestCases: [{ Value: { Pct: 1 }, Expected: true }, { Value: { Pct: -1 }, Expected: false }] }
            : { Description: 'bad', Code: 'return value.Nope;', MethodName: 'Bad', ModelID: 'm' };
        const results = await h.Run({ GenerateNew: true });
        expect(results.map((r) => r.Path)).toEqual(['IConfig.Pct']);
    });

    describe('the model must pass its own TestCases (a self-consistency guard, not proof of equivalence with the SQL)', () => {
        const PCT_CASES = [{ Value: { Pct: 50 }, Expected: true }, { Value: { Pct: 150 }, Expected: false }];
        const run = async (next: Harness['Translator']['Next']) => {
            const h = harness();
            h.Translator.Next = next;
            const results = await h.Run({ GenerateNew: true });
            return { h, results };
        };

        it('rejects a translation that returns no TestCases', async () => {
            const { h, results } = await run(() => ({ Description: 'd', Code: 'return value.Pct >= 0;', MethodName: 'M', ModelID: 'm' }));
            expect(results).toEqual([]);
            expect(h.Errors.some((e) => e.includes('failed its own test cases') && e.includes('no TestCases'))).toBe(true);
            expect(h.Store.Persisted).toEqual([]);
        });

        it('rejects a body that disagrees with its own case (never cached)', async () => {
            const { h, results } = await run(() => ({ Description: 'd', Code: 'return value.Pct >= 100;', MethodName: 'M', ModelID: 'm', TestCases: PCT_CASES }));
            expect(results).toEqual([]);
            expect(h.Errors.some((e) => e.includes('TestCases[0]') && e.includes('expected true'))).toBe(true);
            expect(h.Store.Persisted).toEqual([]);
        });

        it('rejects a body that throws on a case', async () => {
            const { h, results } = await run(() => ({ Description: 'd', Code: 'return value.Items.length > 0;', MethodName: 'M', ModelID: 'm', TestCases: [{ Value: { Pct: 1 }, Expected: true }] }));
            expect(results).toEqual([]);
            expect(h.Errors.some((e) => e.includes('the body threw'))).toBe(true);
        });

        it('rejects a non-terminating body instead of hanging CodeGen', async () => {
            const { results, h } = await run(() => ({ Description: 'd', Code: 'while (true) {}\nreturn true;', MethodName: 'M', ModelID: 'm', TestCases: [{ Value: { Pct: 1 }, Expected: true }] }));
            expect(results).toEqual([]);
            expect(h.Errors.some((e) => e.includes('the body threw'))).toBe(true);
        });

        it('requires a case with an optional/nullable member absent when the type has one (NULL passes)', async () => {
            const { h, results } = await run((text) => text.includes('Pct')
                ? { Description: 'd', Code: 'return value.Pct >= 0;', MethodName: 'M', ModelID: 'm', TestCases: PCT_CASES }
                : { Description: 'd', Code: 'return value.Rate! >= 0;', MethodName: 'M', ModelID: 'm', TestCases: [{ Value: { Rate: 1 }, Expected: true }] });
            // the Rate rule's type has an optional member and its only case never leaves it absent
            expect(results.map((r) => r.Path)).not.toContain('IItem.Rate');
            expect(h.Errors.some((e) => e.includes('optional/nullable member'))).toBe(true);
        });

        it('a body that fails on an absent optional member is caught by the absent case', async () => {
            const { results, h } = await run((text) => text.includes('Pct')
                ? { Description: 'd', Code: 'return value.Pct >= 0;', MethodName: 'M', ModelID: 'm', TestCases: PCT_CASES }
                : { Description: 'd', Code: 'return value.Rate! >= 0;', MethodName: 'M', ModelID: 'm', TestCases: [{ Value: { Rate: 1 }, Expected: true }, { Value: {}, Expected: true }] });
            expect(results.map((r) => r.Path)).not.toContain('IItem.Rate');
            expect(h.Errors.some((e) => e.includes('TestCases[1]') && e.includes('expected true'))).toBe(true);
        });
    });

    it('passes the prompt the scope, property list and the row columns', async () => {
        const seen: Array<Record<string, unknown>> = [];
        const h = harness();
        h.Translator.ParseJSONCheck = async (checkText, scope, propertyList, definition, rowFieldList) => {
            seen.push({ checkText, scope, propertyList, definition, rowFieldList });
            return { Description: 'd', Code: 'return true;', MethodName: 'M', ModelID: 'm', TestCases: [{ Value: { Pct: 1 }, Expected: true }] };
        };
        await h.Run({ GenerateNew: true });
        const first = seen[0];
        expect(first.scope).toEqual({ TypeName: 'IConfig', Property: 'Pct', PerElement: false, ValueType: 'IConfig' });
        expect(first.propertyList).toContain('Pct - number');
        expect(first.propertyList).toContain('Items - IItem[]');
        expect(first.rowFieldList).toContain('Status - nvarchar (not null)');
        expect(first.definition).toBe(SQL_DEFINITION);
    });

    it('a SQL rule on an array-typed property is per-element and its value type is the element type', async () => {
        const def = `/** @mjValidate */\nexport interface IConfig {\n  /** @CHECK (LEN(value) > 0) */\n  Names: string[];\n}`;
        const scopes: unknown[] = [];
        const h = harness();
        h.Translator.ParseJSONCheck = async (_c, scope) => { scopes.push(scope); return { Description: 'd', Code: 'return value.length > 0;', MethodName: 'M', ModelID: 'm', TestCases: [{ Value: 'a', Expected: true }, { Value: '', Expected: false }] }; };
        await h.Run({ GenerateNew: true, Fields: [{ Entity: 'A', Name: 'C', JSONType: 'IConfig', JSONTypeDefinition: def }] });
        expect(scopes[0]).toEqual({ TypeName: 'IConfig', Property: 'Names', PerElement: true, ValueType: 'string' });
    });
});

describe('SQL @CHECK emission into the entity class', () => {
    const sqlEntity = () => makeEntity([makePrimaryKeyField(), makeField({ Name: 'Config', CodeName: 'Config', JSONType: 'IConfig', JSONTypeDefinition: SQL_DEFINITION })]);
    const translation = (path: string, text: string, body: string, description: string) => {
        const r = new JSONValidatorResult();
        r.JSONTypeName = 'IConfig'; r.Path = path; r.NormalizedText = text; r.Key = keyFor('IConfig', path, text, SQL_DEFINITION, 'Test Entity');
        r.FunctionName = 'Rule'; r.FunctionDescription = description; r.FunctionText = body;
        return r;
    };

    it('emits a resolved translation as a typed Test() with its description as the message', async () => {
        (ManageMetadataBase as unknown as { GeneratedJSONValidators: unknown[] }).GeneratedJSONValidators = [
            translation('IConfig.Pct', '(Pct >= 0 AND Pct <= 100)', 'return value.Pct >= 0 && value.Pct <= 100;', 'Percentage must be between 0 and 100'),
            translation('IItem.Rate', '(Rate IS NULL OR Rate >= 0)', 'return value.Rate == null || value.Rate >= 0;', 'Rate cannot be negative'),
        ];
        const out = await gen(sqlEntity());
        expect(out).toContain('Description: "Percentage must be between 0 and 100"');
        expect(out).toContain('Test(value: TestEntityEntity_IConfig, row: TestEntityEntity): boolean {');
        expect(out).toContain('return value.Pct >= 0 && value.Pct <= 100;');
        expect(out).toContain('Test(value: TestEntityEntity_IItem, row: TestEntityEntity): boolean {');
        expect(out).toContain('return value.Rate == null || value.Rate >= 0;');
        expect(vi.mocked(LogWarning)).not.toHaveBeenCalled();
    });

    it('a stored SQL @CHECK translation is emitted verbatim as a rule (this proves emission of the stub, NOT the translator\'s NULL semantics)', async () => {
        (ManageMetadataBase as unknown as { GeneratedJSONValidators: unknown[] }).GeneratedJSONValidators = [
            translation('IItem.Rate', '(Rate IS NULL OR Rate >= 0)', 'return value.Rate == null || value.Rate >= 0;', 'Rate cannot be negative'),
        ];
        const out = await gen(sqlEntity());
        const set = evalRuleSet(out.slice(out.indexOf('{\n            RootType'), out.indexOf(", 'Failure', result);")).replace(/^\s+/, '') as string);
        const rule = set.Rules.find((r) => r.Type === 'IItem')!;
        expect(rule.Test({ Rate: null }, {})).toBe(true);
        expect(rule.Test({}, {})).toBe(true);
        expect(rule.Test({ Rate: -1 }, {})).toBe(false);
    });

    it('a rule with no resolved translation is skipped with a warning, never emitted', async () => {
        const out = await gen(sqlEntity());
        expect(vi.mocked(LogWarning).mock.calls.some((c) => String(c[0]).includes('IConfig.Pct') && String(c[0]).includes('no generated validator'))).toBe(true);
        expect(out).toContain(`this.ValidateJSONField("Config", TestEntityEntity_IConfigSchema, null, 'Failure', result);`);
    });

    it('stored code with escaped newlines is cleaned the way table-CHECK code is', async () => {
        (ManageMetadataBase as unknown as { GeneratedJSONValidators: unknown[] }).GeneratedJSONValidators = [
            translation('IConfig.Pct', '(Pct >= 0 AND Pct <= 100)', 'const p = value.Pct;\\nreturn p >= 0;', 'd'),
        ];
        const out = await gen(sqlEntity());
        expect(out).toContain('const p = value.Pct;\n');
        expect(out).not.toContain('\\nreturn');
    });
});

/* ------------------------------------------------------------------------------------------------
 * 6. Prefix rewrite must not corrupt tag bodies
 * ---------------------------------------------------------------------------------------------- */

describe('type-name prefix rewrite (AST based, for opted-in definitions)', () => {
    const DEFINITION = `/**
 * @mjValidate
 * @CHECK ts:(value.IConfig === undefined && value.Tags.length >= 0)  // IConfig here is a property name, not the type
 * IConfig is the root type.
 */
export interface IConfig {
    IConfig?: string;
    /** @pattern ^IConfig-\\d+$ */
    Code: string;
    Child: IChild;
}
export interface IChild { N: number }
type Alias = IConfig | IChild;`;

    it('renames declarations and type references, and nothing else', () => {
        const out = RewriteJSONTypeDefinition(DEFINITION, 'E');
        expect(out).toContain('export interface E_IConfig {');
        expect(out).toContain('Child: E_IChild;');
        expect(out).toContain('type E_Alias = E_IConfig | E_IChild;');
        // tag bodies, comment prose and a coincidentally named property are untouched
        expect(out).toContain('@CHECK ts:(value.IConfig === undefined && value.Tags.length >= 0)  // IConfig here is a property name, not the type');
        expect(out).toContain(' * IConfig is the root type.');
        expect(out).toContain('@pattern ^IConfig-\\d+$');
        expect(out).toContain('    IConfig?: string;');
    });

    it('extends clauses and typeof references are renamed', () => {
        const out = RewriteJSONTypeDefinition(`export interface IBase { A: number }\nexport interface IDerived extends IBase { B: number }\nexport const c = 1;\nexport type T = typeof c;`, 'E');
        expect(out).toContain('interface E_IDerived extends E_IBase');
    });

    it('an opted-in entity keeps tag bodies intact in the emitted interface, while an untagged one keeps the historical rewrite', async () => {
        const tagged = await gen(makeEntity([makePrimaryKeyField(), makeField({ Name: 'C', CodeName: 'C', JSONType: 'IConfig', JSONTypeDefinition: DEFINITION })]));
        expect(tagged).toContain('IConfig here is a property name, not the type');
        expect(tagged).toContain('@pattern ^IConfig-\\d+$');
        expect(tagged).toContain('    IConfig?: string;');
        const untagged = await gen(makeEntity([makePrimaryKeyField(), makeField({ Name: 'C', CodeName: 'C', JSONType: 'IConfig', JSONTypeDefinition: DEFINITION.replace('@mjValidate', '') })]));
        expect(untagged).toContain('TestEntityEntity_IConfig?: string;'); // legacy behavior, deliberately unchanged
    });

    it('the schema is derived from the original text: a member named like the type stays a member', () => {
        const m = zodModule(DEFINITION, 'IConfig', 'E');
        expect(m.Source).toContain('"IConfig": z.string().optional()');
        expect(m.Source).toContain('"Code": z.string().regex(new RegExp("^IConfig-\\\\d+$"))');
    });
});

describe('logging stays quiet on the clean path', () => {
    it('an opted-in, fully supported, rule-free type logs nothing', async () => {
        vi.clearAllMocks();
        await gen(optedInEntity('/** @mjValidate */\nexport interface IRange { Low: number }'));
        schemaOf(optedInEntity('/** @mjValidate */\nexport interface IRange { Low: number }'));
        expect(vi.mocked(LogWarning)).not.toHaveBeenCalled();
        expect(vi.mocked(logError)).not.toHaveBeenCalled();
    });
});

describe('opted-in definitions are rewritten with every declaration exported', () => {
    it('adds `export` to a non-exported declaration (the exported schema consts name it) and leaves exported ones alone', () => {
        const def = `/** @mjValidate */\ninterface IRoot { Child: IChild }\nexport interface IChild { N: number }\ntype Alias = string;`;
        const out = RewriteJSONTypeDefinition(def, 'P');
        expect(out).toContain('export interface P_IRoot { Child: P_IChild }');
        expect(out).toContain('export interface P_IChild');
        expect(out).not.toMatch(/export export/);
        expect(out).toContain('export type P_Alias = string;');
        // the JSDoc tag comment still sits directly before its declaration
        expect(out.indexOf('@mjValidate')).toBeLessThan(out.indexOf('export interface P_IRoot'));
    });
});
