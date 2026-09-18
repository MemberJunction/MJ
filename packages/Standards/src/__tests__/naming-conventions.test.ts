import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    IsPascalCase,
    IsPrivateShaped,
    IsScreamingSnake,
    NamingConventionsCheck,
    FindCleanPackages,
    SuggestPascalCase,
} from '../checks/naming-conventions.js';

describe('name shapes', () => {
    it('recognises PascalCase', () => {
        expect(IsPascalCase('LoadData')).toBe(true);
        expect(IsPascalCase('IsLoading')).toBe(true);
        expect(IsPascalCase('loadData')).toBe(false);
        expect(IsPascalCase('_LoadData')).toBe(false);
    });

    it('recognises SCREAMING_SNAKE constants, which a literal rule would flag', () => {
        // 419 private static readonly fields in MJ look like this. Treating them as violations is
        // what would have made the rule unadoptable.
        expect(IsScreamingSnake('PREFS_KEY')).toBe(true);
        expect(IsScreamingSnake('CACHE_TTL_MS')).toBe(true);
        expect(IsScreamingSnake('URL')).toBe(true);
        expect(IsScreamingSnake('LoadData')).toBe(false);
    });

    it('accepts both private shapes, since the underscore idiom is documented', () => {
        expect(IsPrivateShaped('destroy$')).toBe(true);
        expect(IsPrivateShaped('_internalState')).toBe(true);
        expect(IsPrivateShaped('config')).toBe(true);
        expect(IsPrivateShaped('LoadData')).toBe(false);
        expect(IsPrivateShaped('_EntityInfo')).toBe(false);
    });
});

let repo: string;

function writePackage(name: string, files: Record<string, string>, manifest: Record<string, unknown> = {}): string {
    const dir = join(repo, 'packages', name);
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: `@demo/${name}`, ...manifest }, null, 2));
    for (const [file, content] of Object.entries(files)) {
        const target = join(dir, 'src', file);
        mkdirSync(join(target, '..'), { recursive: true });
        writeFileSync(target, content);
    }
    return dir;
}

beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'mj-naming-'));
});
afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
});

const run = (options: Record<string, unknown> = {}) =>
    NamingConventionsCheck.Run({
        RepoRoot: repo,
        Roots: ['packages'],
        Options: { ...NamingConventionsCheck.DefaultOptions, ...options },
    });

const messages = async (options: Record<string, unknown> = {}): Promise<string[]> =>
    (await run(options)).Violations.map((v) => v.Message);

describe('R1 — public class members are PascalCase', () => {
    it('flags an explicitly public camelCase member and suggests the fix', async () => {
        writePackage('a', { 'a.ts': 'export class A {\n    public loadData(): void {}\n}' });
        const result = await run();
        expect(result.Violations).toHaveLength(1);
        expect(result.Violations[0].Message).toBe('public member "loadData" is not PascalCase — rename to "LoadData"');
        expect(result.Violations[0].Line).toBe(2);
    });

    it('treats a member with NO modifier as public, because TypeScript does', async () => {
        // The whole reason this needs a parser: `isLoading = false` is public API.
        writePackage('a', { 'a.ts': 'export class A {\n    isLoading = false;\n}' });
        expect(await messages()).toEqual(['public member "isLoading" is not PascalCase — rename to "IsLoading"']);
    });

    it('flags camelCase @Input/@Output, which the Angular convention requires be PascalCase', async () => {
        writePackage('a', {
            'a.ts': '@Component({})\nexport class A {\n    @Input() queryId: string | null = null;\n    @Input() QueryName = "";\n}',
        });
        expect(await messages()).toEqual(['public member "queryId" is not PascalCase — rename to "QueryId"']);
    });

    it('accepts PascalCase properties, methods and accessors', async () => {
        writePackage('a', {
            'a.ts': 'export class A {\n    public IsLoading = false;\n    public LoadData(): void {}\n    public get Config() { return 1; }\n    public set Config(v: number) {}\n}',
        });
        expect((await run()).Violations).toEqual([]);
    });

    it('accepts a public SCREAMING_SNAKE static constant', async () => {
        writePackage('a', { 'a.ts': 'export class A {\n    public static readonly MAX_ROWS = 500;\n}' });
        expect((await run()).Violations).toEqual([]);
    });
});

describe('R2 — private members are camelCase, protected is not checked', () => {
    it('flags a private PascalCase method', async () => {
        writePackage('a', { 'a.ts': 'export class A {\n    private LoadData(): void {}\n}' });
        expect(await messages()).toEqual([
            'private member "LoadData" is PascalCase — private members are camelCase; rename to "loadData"',
        ]);
    });

    it('preserves a leading underscore in the suggestion', async () => {
        writePackage('a', { 'a.ts': 'export class A {\n    private _EntityInfo = 1;\n}' });
        expect(await messages()).toEqual([
            'private member "_EntityInfo" is PascalCase — private members are camelCase; rename to "_entityInfo"',
        ]);
    });

    it('accepts both private shapes and SCREAMING_SNAKE constants', async () => {
        writePackage('a', {
            'a.ts': 'export class A {\n    private destroy$ = 1;\n    private _config = 2;\n    private static readonly PREFS_KEY = "k";\n    private readonly _CACHE_TTL_MS = 1;\n}',
        });
        expect((await run()).Violations).toEqual([]);
    });

    it('does NOT flag protected PascalCase — it is MJ’s template-method pattern', async () => {
        // BaseAction.InternalRunAction and friends. Subclasses cannot deviate from the parent's
        // casing, so enforcing camelCase here would demand a breaking rename of the framework.
        writePackage('a', {
            'a.ts': 'export abstract class A {\n    protected abstract InternalRunAction(): void;\n    protected AdditionalLoading(): void {}\n}',
        });
        expect((await run()).Violations).toEqual([]);
    });
});

describe('R3/R4 — exported symbols are PascalCase', () => {
    it('flags a camelCase exported function', async () => {
        writePackage('a', { 'a.ts': 'export function computeContentHash(): void {}' });
        expect(await messages()).toEqual(['exported function "computeContentHash" is not PascalCase — rename to "ComputeContentHash"']);
    });

    it('flags a camelCase exported arrow function, which is a function by any useful definition', async () => {
        writePackage('a', { 'a.ts': 'export const resolveRestore = () => {};' });
        expect(await messages()).toEqual(['exported function "resolveRestore" is not PascalCase — rename to "ResolveRestore"']);
    });

    it('accepts an exported const that is PascalCase or SCREAMING_SNAKE, and flags camelCase', async () => {
        writePackage('a', {
            'a.ts': 'export const TERMINAL_STATUSES = [1];\nexport const ChatMessageRole = { A: 1 };\nexport const someConfig = { a: 1 };',
        });
        expect(await messages()).toEqual(['exported const "someConfig" is neither PascalCase nor SCREAMING_SNAKE_CASE']);
    });

    it('flags lowercase exported types', async () => {
        writePackage('a', {
            'a.ts': 'export interface thing { A: number }\nexport type other = string;\nexport class fine {}\nexport enum bad { A }',
        });
        expect((await messages()).sort()).toEqual([
            'exported class "fine" is not PascalCase — rename to "Fine"',
            'exported enum "bad" is not PascalCase — rename to "Bad"',
            'exported interface "thing" is not PascalCase — rename to "Thing"',
            'exported type "other" is not PascalCase — rename to "Other"',
        ]);
    });

    it('does not flag a non-exported function', async () => {
        writePackage('a', { 'a.ts': 'function helper(): void {}\nexport const X = helper;' });
        expect((await run()).Violations).toEqual([]);
    });
});

describe('built-in exemptions', () => {
    it('exempts Angular lifecycle hooks', async () => {
        writePackage('a', {
            'a.ts': 'export class A {\n    ngOnInit(): void {}\n    ngOnDestroy(): void {}\n    ngAfterViewInit(): void {}\n}',
        });
        expect((await run()).Violations).toEqual([]);
    });

    it('exempts platform and protocol contract names', async () => {
        writePackage('a', {
            'a.ts': 'export class A {\n    public toJSON() { return {}; }\n    public writeValue(v: number) {}\n    public transform(v: number) { return v; }\n}',
        });
        expect((await run()).Violations).toEqual([]);
    });

    it('exempts oclif members on a Command subclass, but not on an unrelated class', async () => {
        writePackage('a', {
            'cmd.ts': 'export class Usage extends Command {\n    static description = "x";\n    static flags = {};\n    async run(): Promise<void> {}\n}',
            'plain.ts': 'export class Plain {\n    public description = "x";\n}',
        });
        const result = await run();
        expect(result.Violations).toHaveLength(1);
        expect(result.Violations[0].File).toContain('plain.ts');
    });

    it('exempts Error-subclass members', async () => {
        writePackage('a', { 'a.ts': 'export class MyError extends Error {\n    public name = "MyError";\n}' });
        expect((await run()).Violations).toEqual([]);
    });

    it('exempts __mj_ system columns and @HostListener/@HostBinding members', async () => {
        writePackage('a', {
            'a.ts': 'export class A {\n    public __mj_CreatedAt?: Date;\n    @HostListener("click") onClick(): void {}\n    @HostBinding("class.x") hasX = true;\n}',
        });
        expect((await run()).Violations).toEqual([]);
    });

    it('exempts React lifecycle members, including on a class with no typed base', async () => {
        // A boundary built against an injected React (`extends (React as any).Component`) has
        // no base class the contract index can see, so these have to be exempt by name.
        writePackage('a', {
            'a.ts':
                'export class A extends (React as any).Component {\n' +
                '    static getDerivedStateFromError(e: Error) { return { hasError: true }; }\n' +
                '    static getDerivedStateFromProps(p: unknown) { return null; }\n' +
                '    componentDidCatch(e: Error, info: unknown) {}\n' +
                '    componentDidMount() {}\n' +
                '    shouldComponentUpdate() { return true; }\n' +
                '}',
        });
        expect((await run()).Violations).toEqual([]);
    });

    it('exempts a computed or Symbol-keyed member, whose name is not a style choice', async () => {
        writePackage('a', { 'a.ts': 'export class A {\n    public [Symbol.iterator]() { return null; }\n}' });
        expect((await run()).Violations).toEqual([]);
    });
});

describe('the inherited-contract index', () => {
    it('exempts an override that carries NO override keyword — the case `override` alone misses', async () => {
        // ~92% of real overrides in MJ omit the keyword, because TypeScript does not require it
        // unless noImplicitOverride is on. Detecting only `override` would leave ~1,450 unfixable
        // findings, which is how a gate loses its authority.
        //
        // The BASE's own declaration is still flagged, and that is the point: the fix for a
        // camelCase extension point is to rename the base and its overrides together, so the
        // finding belongs on the one line that can lead that change.
        writePackage('base', { 'base.ts': 'export abstract class BaseAction {\n    public runIt(): void {}\n}' });
        writePackage('sub', { 'sub.ts': 'export class MyAction extends BaseAction {\n    public runIt(): void {}\n}' });
        const result = await run();
        expect(result.Violations).toHaveLength(1);
        expect(result.Violations[0].Package).toBe('packages/base');
    });

    it('indexes across package boundaries, since a base class rarely lives with its subclasses', async () => {
        writePackage('base', { 'b.ts': 'export class Provider {\n    public doWork(): void {}\n}' });
        writePackage('sub', { 's.ts': 'export class Sub extends Provider {\n    public doWork(): void {}\n}' });
        const result = await run();
        // Only the base — the subclass in the other package inherited the exemption.
        expect(result.Violations.map((v) => v.Package)).toEqual(['packages/base']);
    });

    it('still flags a camelCase member the base class does NOT declare', async () => {
        writePackage('base', { 'b.ts': 'export class Provider {\n    public doWork(): void {}\n}' });
        writePackage('sub', { 's.ts': 'export class Sub extends Provider {\n    public doWork(): void {}\n    public somethingElse(): void {}\n}' });
        const result = await run();
        const inSub = result.Violations.filter((v) => v.Package === 'packages/sub');
        expect(inSub.map((v) => v.Message)).toEqual(['public member "somethingElse" is not PascalCase — rename to "SomethingElse"']);
    });

    it('does not exempt a matching name in a class with no extends clause', async () => {
        writePackage('base', { 'b.ts': 'export class Provider {\n    public doWork(): void {}\n}' });
        writePackage('other', { 'o.ts': 'export class Unrelated {\n    public doWork(): void {}\n}' });
        // The base's own declaration is flagged too — it is a public member like any other.
        expect((await messages()).length).toBe(2);
    });
});

describe('the reviewed-exception marker', () => {
    it('honours a marker on the offending line', async () => {
        writePackage('a', { 'a.ts': 'export class A {\n    public webhook_url = ""; // case-violation-ok-legacy-back-compat: Slack API field\n}' });
        expect((await run()).Violations).toEqual([]);
    });

    it('honours a marker on the line directly above', async () => {
        writePackage('a', { 'a.ts': 'export class A {\n    // case-violation-ok-legacy-back-compat: Slack API field\n    public webhook_url = "";\n}' });
        expect((await run()).Violations).toEqual([]);
    });

    it('does not honour a marker two lines above — a marker must not drift', async () => {
        writePackage('a', { 'a.ts': 'export class A {\n    // case-violation-ok-legacy-back-compat: stale\n\n    public webhook_url = "";\n}' });
        expect((await run()).Violations).toHaveLength(1);
    });

    it('works on exported functions too', async () => {
        writePackage('a', { 'a.ts': '// case-violation-ok-legacy-back-compat: matches the upstream API\nexport function useAuth0Auth(): void {}' });
        expect((await run()).Violations).toEqual([]);
    });
});

describe('severity comes from whether a compatible fix exists', () => {
    const severities = async (): Promise<Record<string, string>> => {
        const result = await run();
        return Object.fromEntries(result.Violations.map((v) => [v.Message.match(/"([^"]+)"/)?.[1] ?? '?', v.Severity ?? '?']));
    };

    it('errors on everything a deprecated stub can fix', async () => {
        // A class member, an exported function and an exported const all have a runtime carrier,
        // so the old name can survive as a delegating stub. Nothing here is a compatibility problem.
        writePackage('a', {
            'a.ts': 'export class A {\n    public loadData(): void {}\n    private LoadIt(): void {}\n}\nexport function helper(): void {}\nexport const someThing = { a: 1 };',
        });
        const result = await run();
        expect(result.Violations.length).toBeGreaterThan(0);
        expect(result.Violations.every((v) => v.Severity === 'error')).toBe(true);
    });

    it('warns on a data-shape member the package publishes — there is no stub form for it', async () => {
        writePackage('a', {
            'index.ts': "export * from './shape.js';",
            'shape.ts': 'export interface ChatParams {\n    maxTokens: number;\n}',
        });
        expect(await severities()).toEqual({ maxTokens: 'warn' });
    });

    it('errors on a data-shape member the package does NOT publish — no consumer can name it', async () => {
        // Same interface, but the entry point does not re-export it, so renaming breaks nobody.
        writePackage('a', {
            'index.ts': 'export const PLACEHOLDER = 1;',
            'shape.ts': 'export interface ChatParams {\n    maxTokens: number;\n}',
        });
        expect(await severities()).toEqual({ maxTokens: 'error' });
    });

    it('errors on a data-shape member in a private package — it is published to nobody', async () => {
        writePackage('a', {
            'index.ts': "export * from './shape.js';",
            'shape.ts': 'export interface ChatParams {\n    maxTokens: number;\n}',
        }, { private: true });
        expect(await severities()).toEqual({ maxTokens: 'error' });
    });

    it('errors on a published interface a class implements — the class carries both names', async () => {
        writePackage('a', {
            'index.ts': "export * from './shape.js';\nexport * from './impl.js';",
            'shape.ts': 'export interface Runner {\n    doWork(): void;\n}',
            'impl.ts': 'export class R implements Runner {\n    public doWork(): void {}\n}',
        });
        // One finding, on the interface, and it is fixable because R can hold both names.
        expect(await severities()).toEqual({ doWork: 'error' });
    });

    it('warns on a data-shape member published under an ALIAS, which consumers can still name', async () => {
        // `export { ChatParams as PublicChatParams }` publishes the alias, but the finding on
        // `maxTokens` carries the DECLARATION name `ChatParams`. Matching only the alias makes
        // the member look unpublished and returns `error` — and `error` type members are what
        // the rename pass selects, so a member an external consumer can spell would be renamed
        // with no runtime stub possible.
        writePackage('a', {
            'index.ts': "export { ChatParams as PublicChatParams } from './shape.js';",
            'shape.ts': 'export interface ChatParams {\n    maxTokens: number;\n}',
        });
        expect(await severities()).toEqual({ maxTokens: 'warn' });
    });

    it('still errors on a sibling type the aliased entry does not re-export', async () => {
        // The alias fix must not publish the whole file — only the named declaration.
        writePackage('a', {
            'index.ts': "export { ChatParams as PublicChatParams } from './shape.js';",
            'shape.ts':
                'export interface ChatParams {\n    maxTokens: number;\n}\n' +
                'export interface HiddenParams {\n    topP: number;\n}',
        });
        expect(await severities()).toEqual({ maxTokens: 'warn', topP: 'error' });
    });

    it('promotes data shapes to error when enforceTypeMembers takes the type-only break', async () => {
        writePackage('a', {
            'index.ts': "export * from './shape.js';",
            'shape.ts': 'export interface ChatParams {\n    maxTokens: number;\n}',
        });
        const result = await run({ enforceTypeMembers: true });
        expect(result.Violations.map((v) => v.Severity)).toEqual(['error']);
    });

    it('resolves the entry point from package.json main, not just src/index.ts', async () => {
        writePackage('a', {
            'entry.ts': "export * from './shape.js';",
            'shape.ts': 'export interface ChatParams {\n    maxTokens: number;\n}',
        }, { main: 'dist/entry.js' });
        expect(await severities()).toEqual({ maxTokens: 'warn' });
    });

    it('treats a type published only through an exports SUBPATH as published', async () => {
        // `@scope/pkg/forms` is as public as `@scope/pkg`. Reading only `types`/`main` declares the
        // subpath's types unpublished and therefore free to rename, which is backwards.
        writePackage('a', {
            'index.ts': 'export const PLACEHOLDER = 1;',
            'forms/index.ts': "export * from './shape.js';",
            'forms/shape.ts': 'export interface ChatParams {\n    maxTokens: number;\n}',
        }, {
            types: 'dist/index.d.ts',
            exports: {
                '.': { types: './dist/index.d.ts' },
                './forms': { types: './dist/forms/index.d.ts' },
            },
        });
        expect(await severities()).toEqual({ maxTokens: 'warn' });
    });

    it('still errors on a type no subpath reaches', async () => {
        writePackage('a', {
            'index.ts': 'export const PLACEHOLDER = 1;',
            'forms/index.ts': 'export const OTHER = 2;',
            'shape.ts': 'export interface ChatParams {\n    maxTokens: number;\n}',
        }, {
            types: 'dist/index.d.ts',
            exports: {
                '.': { types: './dist/index.d.ts' },
                './forms': { types: './dist/forms/index.d.ts' },
            },
        });
        expect(await severities()).toEqual({ maxTokens: 'error' });
    });
});

describe('@deprecated — the back-compat stub exclusion', () => {
    it('suppresses a finding on a deprecated class member, which is the whole cleanup pattern', async () => {
        writePackage('a', {
            'a.ts': 'export class A {\n    public LoadData(): void {}\n    /** @deprecated Use {@link LoadData}. */\n    public loadData(): void { return this.LoadData(); }\n}',
        });
        expect((await run()).Violations).toEqual([]);
    });

    it('suppresses deprecated exported functions, consts and accessors alike', async () => {
        writePackage('a', {
            'a.ts': '/** @deprecated Use {@link Helper}. */\nexport function helper(): void {}\n'
                + '/** @deprecated */\nexport const someThing = { a: 1 };\n'
                + 'export class A {\n    /** @deprecated */\n    public get config() { return 1; }\n}',
        });
        expect((await run()).Violations).toEqual([]);
    });

    it('suppresses a deprecated member of an exported interface', async () => {
        writePackage('a', {
            'a.ts': 'export interface P {\n    MaxTokens: number;\n    /** @deprecated Use MaxTokens. */\n    maxTokens?: number;\n}',
        });
        expect((await run()).Violations).toEqual([]);
    });

    it('reports how many findings it suppressed, so the exclusion cannot become a quiet hiding place', async () => {
        writePackage('a', {
            'a.ts': 'export class A {\n    /** @deprecated */\n    public loadData(): void {}\n    public saveData(): void {}\n}',
        });
        const result = await run();
        expect(result.Violations).toHaveLength(1);
        expect(result.Notes?.join(' ')).toContain('1 finding(s) suppressed by an @deprecated tag');
    });

    it('does not suppress a neighbouring member that is not itself deprecated', async () => {
        writePackage('a', {
            'a.ts': 'export class A {\n    /** @deprecated */\n    public loadData(): void {}\n    public saveData(): void {}\n}',
        });
        expect((await messages())).toEqual(['public member "saveData" is not PascalCase — rename to "SaveData"']);
    });

    it('is not fooled by the word deprecated in ordinary prose', async () => {
        writePackage('a', {
            'a.ts': 'export class A {\n    /** This replaces the deprecated approach. */\n    public loadData(): void {}\n}',
        });
        expect((await run()).Violations).toHaveLength(1);
    });
});

describe('what gets read', () => {
    it('skips tests by default and reads them when asked', async () => {
        writePackage('a', {
            'a.test.ts': 'export class A {\n    public loadData(): void {}\n}',
            '__tests__/b.ts': 'export class B {\n    public loadData(): void {}\n}',
        });
        expect((await run()).Violations).toEqual([]);
        expect((await run({ includeTests: true })).Violations).toHaveLength(2);
    });

    it('skips generated output, whose fix belongs in the generator', async () => {
        writePackage('a', { 'generated/g.ts': 'export class G {\n    public record!: string;\n}' });
        expect((await run()).Violations).toEqual([]);
    });

    it('skips declaration files', async () => {
        writePackage('a', { 'a.d.ts': 'export declare class A {\n    public loadData(): void;\n}' });
        expect((await run()).Violations).toEqual([]);
    });

    it('reports each file once even when packages nest, attributing it to the innermost', async () => {
        writePackage('outer', { 'a.ts': 'export class A {\n    public loadData(): void {}\n}' });
        writePackage('outer/inner', { 'b.ts': 'export class B {\n    public loadData(): void {}\n}' });
        const result = await run();
        expect(result.Violations).toHaveLength(2);
        expect(result.Violations.map((v) => v.Package).sort()).toEqual(['packages/outer', 'packages/outer/inner']);
    });
});

describe('repo-level allowlist options', () => {
    it('accepts names and prefixes the repo declares', async () => {
        writePackage('a', {
            'a.ts': 'export class A {\n    public legacyThing = 1;\n    public wire_field = 2;\n}',
        });
        expect((await run({ allowedNames: ['legacyThing'], allowedPrefixes: ['wire_'] })).Violations).toEqual([]);
    });
});

describe('FindCleanPackages', () => {
    it('returns only the packages with no violations, for tracking cleanup progress', async () => {
        writePackage('clean', { 'a.ts': 'export class A {\n    public LoadData(): void {}\n}' });
        writePackage('dirty', { 'b.ts': 'export class B {\n    public loadData(): void {}\n}' });
        expect(await FindCleanPackages(repo, ['packages'])).toEqual(['packages/clean']);
    });
});

describe('exported members — an exported type\u2019s members are API surface too', () => {
    it('flags camelCase members of an exported interface', async () => {
        writePackage('a', { 'a.ts': 'export interface ChatParams {\n    maxTokens: number;\n    TopP: number;\n}' });
        expect(await messages()).toEqual([
            'exported interface member "maxTokens" is not PascalCase — rename to "MaxTokens"',
        ]);
    });

    it('flags snake_case wire-format members, which is what the marker is for', async () => {
        writePackage('a', { 'a.ts': 'export interface TokenResponse {\n    access_token: string;\n}' });
        expect(await messages()).toEqual([
            'exported interface member "access_token" is not PascalCase — rename to "AccessToken"',
        ]);
        // The realistic fix for a vendor payload is the marker, not a rename.
        writePackage('b', { 'b.ts': 'export interface TokenResponse {\n    access_token: string; // case-violation-ok-legacy-back-compat: OAuth wire format\n}' });
        expect((await run()).Violations.filter((v) => v.Package === 'packages/b')).toEqual([]);
    });

    it('does NOT flag a non-exported interface — it is not API surface', async () => {
        writePackage('a', { 'a.ts': 'interface Options {\n    maxTokens: number;\n}\nexport const X = 1;' });
        expect((await run()).Violations).toEqual([]);
    });

    it('exempts members an exported interface inherits from a base interface', async () => {
        writePackage('a', {
            'base.ts': 'export interface BaseParams {\n    maxTokens: number;\n}',
            'sub.ts': 'export interface ChatParams extends BaseParams {\n    maxTokens: number;\n}',
        });
        const result = await run();
        // Only the base declares it; the extension inherits the name and cannot deviate.
        expect(result.Violations).toHaveLength(1);
        expect(result.Violations[0].File).toContain('base.ts');
    });

    it('flags members of an object literal inside an exported type alias, including nested ones', async () => {
        writePackage('a', { 'a.ts': 'export type Config = {\n    retryCount: number;\n    nested: { innerFlag: boolean };\n};' });
        expect((await messages()).sort()).toEqual([
            'exported type member "innerFlag" is not PascalCase — rename to "InnerFlag"',
            'exported type member "nested" is not PascalCase — rename to "Nested"',
            'exported type member "retryCount" is not PascalCase — rename to "RetryCount"',
        ]);
    });

    it('accepts enum members that are PascalCase or SCREAMING_SNAKE', async () => {
        writePackage('a', { 'a.ts': 'export enum Status {\n    Running,\n    NOT_STARTED,\n    inFlight,\n}' });
        expect(await messages()).toEqual(['exported enum member "inFlight" is not PascalCase — rename to "InFlight"']);
    });

    it('exempts SCREAMING_SNAKE, __mj_ columns and platform names on an exported interface', async () => {
        writePackage('a', {
            'a.ts': 'export interface Row {\n    MAX_ROWS: number;\n    __mj_CreatedAt: Date;\n    toJSON(): string;\n}',
        });
        expect((await run()).Violations).toEqual([]);
    });

    it('flags a camelCase name published through an export list', async () => {
        writePackage('a', { 'a.ts': 'const helper = 1;\nexport { helper };' });
        expect(await messages()).toEqual(['exported name "helper" is not PascalCase — rename to "Helper"']);
    });

    it('does not flag a re-export, whose name belongs to the module it came from', async () => {
        // A barrel file cannot fix the name; it is judged where it is declared.
        writePackage('a', { 'a.ts': "export { helper } from './other.js';" });
        expect((await run()).Violations).toEqual([]);
    });

    it('labels an exported let/var as a binding rather than a const', async () => {
        writePackage('a', { 'a.ts': 'export let currentWorkingDirectory = "";' });
        expect(await messages()).toEqual([
            'exported binding "currentWorkingDirectory" is neither PascalCase nor SCREAMING_SNAKE_CASE',
        ]);
    });
});

describe('constructor parameter properties are class members', () => {
    it('flags a public parameter property and leaves a plain parameter alone', async () => {
        writePackage('a', { 'a.ts': 'export class A {\n    constructor(public queryId: string, plain: number) {}\n}' });
        expect(await messages()).toEqual([
            'public parameter property "queryId" is not PascalCase — rename to "QueryId"',
        ]);
    });

    it('accepts a camelCase private parameter property, which is the documented shape', async () => {
        writePackage('a', { 'a.ts': 'export class A {\n    constructor(private cdr: ChangeDetectorRef, readonly Name: string) {}\n}' });
        expect((await run()).Violations).toEqual([]);
    });

    it('flags a PascalCase private parameter property', async () => {
        writePackage('a', { 'a.ts': 'export class A {\n    constructor(private Cdr: ChangeDetectorRef) {}\n}' });
        expect(await messages()).toEqual([
            'private parameter property "Cdr" is PascalCase — private members are camelCase; rename to "cdr"',
        ]);
    });

    it('does not check a protected parameter property, consistent with protected members', async () => {
        writePackage('a', { 'a.ts': 'export class A {\n    constructor(protected Metadata: Meta) {}\n}' });
        expect((await run()).Violations).toEqual([]);
    });
});

describe('implements is a contract, like extends', () => {
    it('exempts a class member dictated by an interface it implements', async () => {
        writePackage('a', {
            'iface.ts': 'export interface Runner {\n    doWork(): void;\n}',
            'impl.ts': 'export class R implements Runner {\n    public doWork(): void {}\n}',
        });
        const result = await run();
        // The interface is the authority, so the one finding lands there — not on every implementor.
        expect(result.Violations).toHaveLength(1);
        expect(result.Violations[0].File).toContain('iface.ts');
    });
});

describe('suggestions must themselves be valid', () => {
    it('converts snake_case to real PascalCase, not a capitalised first letter', () => {
        expect(SuggestPascalCase('output_config')).toBe('OutputConfig');
        expect(SuggestPascalCase('access_token')).toBe('AccessToken');
        expect(SuggestPascalCase('maxTokens')).toBe('MaxTokens');
    });

    it('exempts `$`-sigil names owned by a spec, rather than suggesting a rename to themselves', async () => {
        // `$schema` is the JSON Schema keyword. Found by running the check over this repo, where it
        // produced `rename to "$schema"` — a message that teaches nothing.
        writePackage('a', { 'a.ts': 'export interface Config {\n    $schema?: string;\n}' });
        expect((await run()).Violations).toEqual([]);
    });
});
