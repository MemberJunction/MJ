import ts from 'typescript';
import { existsSync, lstatSync } from 'node:fs';
import { join, dirname, basename, resolve, sep } from 'node:path';

const COMPILER_OPTIONS: ts.CompilerOptions = { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022, moduleResolution: ts.ModuleResolutionKind.Bundler, strict: true, experimentalDecorators: true, esModuleInterop: true, skipLibCheck: true, noEmit: true, allowJs: false };
const LIB_DIR = dirname(ts.getDefaultLibFilePath(COMPILER_OPTIONS));
const LIB_FILE_RE = /^lib\..*\.d\.ts$/;
/** Parsed TypeScript library files (`lib.*.d.ts`), shared by every program `TestAst.Load` builds. */
const libSourceFiles = new Map<string, ts.SourceFile>();

/** One property or element access in the test: `obj.x` or `obj['x']`. */
export interface MemberAccess { Node: ts.Node; Name: string; Receiver: ts.Expression; }
export type MemberVisibility = 'public' | 'private' | 'protected' | 'none';

/** A TypeScript program over one generated test file plus the base package it imports, with the queries the rules need. */
export class TestAst {
    private constructor(public readonly SourceFile: ts.SourceFile, public readonly Checker: ts.TypeChecker, private readonly program: ts.Program) {}

    /**
     * Builds the program. `extraFiles` maps absolute paths to in-memory sources that take precedence over disk.
     * From disk the host reads only regular files (by `lstat`) and nothing in the test's own folder (the jit folder,
     * which sandboxed tests can write), so a planted symlink or FIFO there resolves to nothing.
     */
    public static Load(testSource: string, baseRootDir: string, packageRelDir: string, testFilePath: string, extraFiles: Record<string, string> = {}): TestAst {
        const testAbs = join(baseRootDir, testFilePath);
        const files: Record<string, string> = { ...extraFiles, [testAbs]: testSource };
        const tsconfigPath = join(baseRootDir, packageRelDir, 'tsconfig.json');
        const options = existsSync(tsconfigPath) ? ts.parseJsonConfigFileContent(ts.readConfigFile(tsconfigPath, ts.sys.readFile).config, ts.sys, dirname(tsconfigPath)).options : COMPILER_OPTIONS;
        const host = ts.createCompilerHost({ ...options, noEmit: true });
        const readable = TestAst.diskFilter(dirname(testAbs));
        const readFile = host.readFile; host.readFile = (f) => (f in files ? files[f] : readable(f) ? readFile(f) : undefined);
        const fileExists = host.fileExists; host.fileExists = (f) => f in files || (readable(f) && fileExists(f));
        const memoryDirs = new Set(Object.keys(files).flatMap((f) => TestAst.ancestors(f)));
        const directoryExists = host.directoryExists?.bind(host);
        host.directoryExists = (d) => memoryDirs.has(d) || (directoryExists ? directoryExists(d) : ts.sys.directoryExists(d));
        const getSourceFile = host.getSourceFile;
        host.getSourceFile = (f, lang, onError, create) => {
            if (f in files) return ts.createSourceFile(f, files[f], lang);
            if (!TestAst.isLibFile(f)) return getSourceFile(f, lang, onError, create);
            const cached = libSourceFiles.get(f);
            if (cached) return cached;
            const parsed = getSourceFile(f, lang, onError, create);
            if (parsed) libSourceFiles.set(f, parsed);
            return parsed;
        };
        const program = ts.createProgram([testAbs], { ...options, noEmit: true, types: [] }, host);
        const sourceFile = program.getSourceFile(testAbs);
        if (!sourceFile) throw new Error(`TestAst: test file not in program: ${testAbs}`);
        return new TestAst(sourceFile, program.getTypeChecker(), program);
    }

    /** A check for disk paths the host may read: outside `jitDir`, and a regular file when it exists. */
    private static diskFilter(jitDir: string): (file: string) => boolean {
        const jitPrefix = resolve(jitDir) + sep;
        return (file) => {
            const abs = resolve(file);
            if (abs.startsWith(jitPrefix)) return false;
            const st = lstatSync(abs, { throwIfNoEntry: false });
            return !st || st.isFile();
        };
    }

    /** True for a `lib.*.d.ts` file in the TypeScript package's library folder. */
    private static isLibFile(file: string): boolean {
        return dirname(file) === LIB_DIR && LIB_FILE_RE.test(basename(file));
    }

    /** Every folder above `file`, up to the root. */
    private static ancestors(file: string): string[] {
        const out: string[] = [];
        for (let d = dirname(file); d !== dirname(d); d = dirname(d)) out.push(d);
        return out;
    }

    /** Every property access and string-keyed element access: reads, writes and calls alike. */
    public MemberAccesses(): MemberAccess[] {
        const out: MemberAccess[] = [];
        const visit = (n: ts.Node): void => {
            if (ts.isPropertyAccessExpression(n)) out.push({ Node: n, Name: n.name.text, Receiver: n.expression });
            else if (ts.isElementAccessExpression(n) && ts.isStringLiteralLike(n.argumentExpression)) out.push({ Node: n, Name: n.argumentExpression.text, Receiver: n.expression });
            ts.forEachChild(n, visit);
        };
        visit(this.SourceFile); return out;
    }

    /** Strips casts, parentheses and `!`; follows an identifier to its initializer when that initializer is a cast (`const s = svc as unknown as X`). */
    public InnermostExpression(e: ts.Expression): ts.Expression {
        let cur = e;
        for (let hops = 0; hops < 8; hops++) {
            while (ts.isAsExpression(cur) || ts.isTypeAssertionExpression(cur) || ts.isParenthesizedExpression(cur) || ts.isSatisfiesExpression(cur) || ts.isNonNullExpression(cur)) cur = cur.expression;
            if (!ts.isIdentifier(cur)) return cur;
            const decl = this.Checker.getSymbolAtLocation(cur)?.valueDeclaration;
            if (!decl || !ts.isVariableDeclaration(decl) || !decl.initializer) return cur;
            const init = decl.initializer;
            if (!(ts.isAsExpression(init) || ts.isTypeAssertionExpression(init) || ts.isParenthesizedExpression(init) || ts.isSatisfiesExpression(init))) return cur;
            cur = init;
        }
        return cur;
    }

    /** Visibility of `name` on the type of the innermost receiver (before any cast); 'none' when no declared class member exists. */
    public DeclarationVisibility(receiver: ts.Expression, name: string): MemberVisibility {
        const inner = this.InnermostExpression(receiver);
        const type = this.Checker.getTypeAtLocation(inner);
        const symbol = type.getProperty(name) ?? this.Checker.getApparentType(type).getProperty(name);
        const decl = symbol?.declarations?.[0]; if (!decl) return 'none';
        if (decl.getSourceFile() === this.SourceFile) return 'none';                  // declared by the test itself, not by base
        if (ts.isObjectLiteralExpression(decl.parent)) return 'none';                 // a member of an inline stub, not of a declared class
        const mods = ts.canHaveModifiers(decl) ? ts.getModifiers(decl) ?? [] : [];
        if (mods.some((m) => m.kind === ts.SyntaxKind.PrivateKeyword) || (ts.isPropertyDeclaration(decl) && ts.isPrivateIdentifier(decl.name))) return 'private';
        if (mods.some((m) => m.kind === ts.SyntaxKind.ProtectedKeyword)) return 'protected';
        return 'public';
    }

    /** Calls whose callee text matches one of `names` exactly (e.g. `expect`, `vi.mock`). */
    public CallsTo(names: string[]): ts.CallExpression[] {
        const out: ts.CallExpression[] = [];
        const visit = (n: ts.Node): void => { if (ts.isCallExpression(n) && names.includes(n.expression.getText(this.SourceFile))) out.push(n); ts.forEachChild(n, visit); };
        visit(this.SourceFile); return out;
    }
    /** The X in each `expect(X)`. */
    public ExpectArguments(): ts.Expression[] { return this.CallsTo(['expect']).map((c) => c.arguments[0]).filter((a): a is ts.Expression => Boolean(a)); }
    /** 1-based line of the node's first token. */
    public LineOf(node: ts.Node): number { return this.SourceFile.getLineAndCharacterOfPosition(node.getStart(this.SourceFile)).line + 1; }
    /** 1-based line ranges of each `vi.mock`, `beforeEach` or `beforeAll` call. */
    public RangesOf(kind: 'vi.mock' | 'beforeEach' | 'beforeAll'): { Start: number; End: number }[] {
        return this.CallsTo([kind]).map((c) => ({ Start: this.LineOf(c), End: this.SourceFile.getLineAndCharacterOfPosition(c.getEnd()).line + 1 }));
    }
    public Text(node: ts.Node): string { return node.getText(this.SourceFile); }
}
