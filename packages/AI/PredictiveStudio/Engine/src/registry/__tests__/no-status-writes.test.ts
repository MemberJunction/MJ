/**
 * §5.7 R0 (Task M4b.4): **one publish function** — no assignment to an `MJMLModelEntity`'s `Status` outside
 * `registry/lifecycle-gate.ts` in `packages/AI/PredictiveStudio/**` or `packages/Angular/**`, found by an AST scan with
 * the TypeScript compiler API ({@link StatusAssignments.Scan}), plus a self-test that a planted assignment is found with
 * its file and line.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** One assignment to an ML model's `Status`: the file (relative to the repository root, `/`-separated) and its 1-based line. */
export interface StatusAssignment {
  readonly File: string;
  readonly Line: number;
}

/** A call that may write an ML model's `Status` without an assignment (reported, not failing): where, and which form. */
export interface StatusWriteCall extends StatusAssignment {
  readonly Form: "Set('Status')" | 'SetMany({ Status })' | 'Object.assign(model, { Status })';
}

/** The candidates of one scan, type-checked together. */
interface ScanProgram {
  readonly Repo: string;
  readonly Candidates: readonly string[];
  readonly Program: ts.Program;
  readonly Checker: ts.TypeChecker;
}

/**
 * The R0 scan. A file under a root is a candidate when it is production TypeScript under a `src/` directory (not
 * `.d.ts`, not under `node_modules`, `dist` or `__tests__`, not `*.test.ts`/`*.spec.ts` — the Engine tsconfig's own
 * `exclude` — and not a generated class-registration manifest) and its text matches {@link CANDIDATE_TEXT} (it names `MJMLModelEntity` or assigns a `Status` member). One
 * `ts.Program` is built over every candidate with the Engine's compiler options (no emit, `skipLibCheck`); in each
 * candidate, a `=` `BinaryExpression` is flagged when a target it writes is `<expr>.Status`, `<expr>['Status']` or
 * `<expr>[key]` with a key whose type is the literal `'Status'` — its left side itself, or any target of an object or
 * array destructuring assignment on its left (`({ Status: model.Status } = src)`, `[model.Status] = values`) — and the
 * checker's type of `<expr>` — or a member of its union/intersection, or any base class — has the symbol name
 * `MJMLModelEntity`. An import of a package that can carry that type ({@link StatusAssignments.ModelTypeSource}) the
 * program cannot resolve throws, so a root whose model types do not resolve fails the scan instead of silently finding
 * nothing.
 *
 * {@link ScanCalls} lists the call forms that write a field without an assignment — `model.Set('Status', …)`,
 * `model.SetMany({ Status })`, `Object.assign(model, { Status })` on an ML model — as a report, not a failure (the gate's
 * runtime status rule backstops them; the R0 ruling scoped the failing scan to assignments).
 */
export class StatusAssignments {
  /** A file's text that makes it a candidate: an ML model type name, or an assignment to a `Status` member. */
  public static readonly CANDIDATE_TEXT =
    /MJMLModelEntity|\.\s*Status\s*(=(?!=)|[,}\]])|\[\s*['"`]Status['"`]\s*\]\s*=(?!=)|\[\s*[A-Za-z_$][\w$]*\s*\]\s*=(?!=)|\.Set\(\s*['"`]Status['"`]|SetMany\(|Object\.assign\(/;

  /**
   * Every assignment to an `MJMLModelEntity`'s `Status` under `roots` (relative to the repository root, or absolute),
   * except in files whose repository-relative path ends with an `Allow` entry.
   *
   * @throws Error when a root does not exist, or a candidate's import of a model-type package does not resolve
   */
  public static Scan(roots: readonly string[], options: { readonly Allow: readonly string[] }): readonly StatusAssignment[] {
    const found: StatusAssignment[] = [];
    StatusAssignments.eachSource(StatusAssignments.build(roots), options.Allow, (source, checker, relative) =>
      StatusAssignments.visit(source, checker, (line) => found.push({ File: relative, Line: line })));
    return found;
  }

  /**
   * Every `Set('Status', …)`, `SetMany({ Status … })` or `Object.assign(<model>, { Status … })` call on an
   * `MJMLModelEntity` under `roots`, except in `Allow` files — reported by the R0 test, never failing it.
   *
   * @throws Error as {@link Scan} does
   */
  public static ScanCalls(roots: readonly string[], options: { readonly Allow: readonly string[] }): readonly StatusWriteCall[] {
    const found: StatusWriteCall[] = [];
    StatusAssignments.eachSource(StatusAssignments.build(roots), options.Allow, (source, checker, relative) =>
      StatusAssignments.visitCalls(source, checker, (line, form) => found.push({ File: relative, Line: line, Form: form })));
    return found;
  }

  /** The repository root: the nearest directory above this file holding `pnpm-workspace.yaml`. */
  public static RepositoryRoot(): string {
    let dir = path.dirname(fileURLToPath(import.meta.url));
    while (!fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) {
      const parent = path.dirname(dir);
      if (parent === dir) throw new Error('StatusAssignments: no pnpm-workspace.yaml above the test file');
      dir = parent;
    }
    return dir;
  }

  /** The candidate files under `root` (see the class comment), absolute. */
  public static Candidates(root: string): string[] {
    if (!fs.existsSync(root)) throw new Error(`StatusAssignments: the root ${root} does not exist`);
    const out: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '__tests__') continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (StatusAssignments.isProductionSource(full) && StatusAssignments.CANDIDATE_TEXT.test(fs.readFileSync(full, 'utf8'))) out.push(full);
      }
    };
    walk(root);
    return out;
  }

  /** The Engine's compiler options (`Engine/tsconfig.json`, its `extends` applied) for a type-check only: no emit, `skipLibCheck`. */
  public static EngineCompilerOptions(repo: string): ts.CompilerOptions {
    const configPath = path.join(repo, 'packages/AI/PredictiveStudio/Engine/tsconfig.json');
    const read = ts.readConfigFile(configPath, (p) => ts.sys.readFile(p));
    if (read.error !== undefined) throw new Error(`StatusAssignments: ${ts.flattenDiagnosticMessageText(read.error.messageText, ' ')}`);
    const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, path.dirname(configPath));
    return {
      ...parsed.options, noEmit: true, skipLibCheck: true, incremental: false, tsBuildInfoFile: undefined,
      declaration: false, declarationMap: false, sourceMap: false, rootDir: undefined, outDir: undefined,
    };
  }

  /** Programs already built, by their roots: each costs tens of seconds over Predictive Studio plus Angular. */
  private static readonly builtPrograms = new Map<string, ScanProgram>();

  /** Builds (once) the program over `roots`, so a test's `beforeAll` can pay for it outside any test's timeout. */
  public static Prepare(roots: readonly string[]): void {
    StatusAssignments.build(roots);
  }

  /** One type-checked program over the candidates under `roots`, built once per distinct set of roots. */
  private static build(roots: readonly string[]): ScanProgram {
    const key = roots.join('\u0000');
    const cached = StatusAssignments.builtPrograms.get(key);
    if (cached !== undefined) return cached;
    const scan = StatusAssignments.buildProgram(roots);
    StatusAssignments.builtPrograms.set(key, scan);
    return scan;
  }

  /** Type-checks the candidates under `roots`. */
  private static buildProgram(roots: readonly string[]): ScanProgram {
    const repo = StatusAssignments.RepositoryRoot();
    const candidates = roots.flatMap((r) => StatusAssignments.Candidates(path.resolve(repo, r)));
    const program = ts.createProgram(candidates, StatusAssignments.EngineCompilerOptions(repo));
    return { Repo: repo, Candidates: candidates, Program: program, Checker: program.getTypeChecker() };
  }

  /** Calls `each` for every candidate whose imports resolve and whose repository-relative path ends with no `allow` entry. */
  private static eachSource(scan: ScanProgram, allow: readonly string[], each: (source: ts.SourceFile, checker: ts.TypeChecker, relative: string) => void): void {
    for (const file of scan.Candidates) {
      const source = scan.Program.getSourceFile(file);
      if (source === undefined) throw new Error(`StatusAssignments: ${file} is not in the program`);
      StatusAssignments.assertImportsResolve(source, scan.Checker);
      const relative = path.relative(scan.Repo, file).split(path.sep).join('/');
      if (allow.some((a) => relative.endsWith(a))) continue;
      each(source, scan.Checker, relative);
    }
  }

  /**
   * The generated class-registration manifests (`mj:manifest`): an import of every registered class and a list of them,
   * no statement that could write a field. Each imports every package of its app, so one not built in the scanning
   * environment would fail the scan on a file that cannot hold what it looks for.
   */
  private static readonly GENERATED_MANIFEST = /\/src\/generated\/(mj-class-registrations|class-registrations-manifest)\.ts$/;

  private static isProductionSource(file: string): boolean {
    const posix = file.split(path.sep).join('/');
    return posix.endsWith('.ts') && !posix.endsWith('.d.ts') && !/\.(test|spec)\.ts$/.test(posix) && posix.includes('/src/')
      && !StatusAssignments.GENERATED_MANIFEST.test(posix);
  }

  /**
   * True for a package that can hand a file an `MJMLModelEntity`: the generated entities, their server subclasses, and
   * the Predictive Studio packages. MJ forbids re-exports between packages, so no other package carries the type; an
   * unresolved import of one cannot hide an ML model Status write, while it would fail the scan whenever a package the
   * scanning environment has not built (a CI unit shard's) is imported by a file the scan reads.
   */
  public static ModelTypeSource(specifier: string): boolean {
    return specifier === '@memberjunction/core-entities' || specifier === '@memberjunction/core-entities-server'
      || specifier.startsWith('@memberjunction/predictive-studio');
  }

  /** Throws naming the file when one of its imports of a {@link ModelTypeSource} package has no module symbol (its types would be unknown). */
  private static assertImportsResolve(source: ts.SourceFile, checker: ts.TypeChecker): void {
    for (const statement of source.statements) {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
      if (!StatusAssignments.ModelTypeSource(statement.moduleSpecifier.text)) continue;
      if (checker.getSymbolAtLocation(statement.moduleSpecifier) === undefined) {
        throw new Error(`StatusAssignments: ${source.fileName} imports ${statement.moduleSpecifier.text}, which does not resolve with the Engine's compiler options`);
      }
    }
  }

  /** Calls `hit` with the 1-based line of each `Status` assignment on an ML model in `source`. */
  private static visit(source: ts.SourceFile, checker: ts.TypeChecker, hit: (line: number) => void): void {
    const walk = (node: ts.Node): void => {
      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
        const writesModelStatus = StatusAssignments.assignedTargets(node.left).some((t) => {
          const target = StatusAssignments.statusTarget(t, checker);
          return target !== null && StatusAssignments.isModelType(checker.getTypeAtLocation(target), checker, new Set());
        });
        if (writesModelStatus) hit(source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1);
      }
      ts.forEachChild(node, walk);
    };
    walk(source);
  }

  /**
   * The expressions an assignment's left side writes: the side itself, or each target of an object/array destructuring
   * pattern (nested patterns and `...rest` included). A target with a default (`[model.Status = x] = …`) is itself a
   * `=` expression, which the walk visits on its own.
   */
  private static assignedTargets(left: ts.Expression): ts.Expression[] {
    let inner = left;
    while (ts.isParenthesizedExpression(inner)) inner = inner.expression;
    if (ts.isArrayLiteralExpression(inner)) {
      return inner.elements.flatMap((e) => StatusAssignments.assignedTargets(ts.isSpreadElement(e) ? e.expression : e));
    }
    if (ts.isObjectLiteralExpression(inner)) {
      return inner.properties.flatMap((p) => {
        if (ts.isPropertyAssignment(p)) return StatusAssignments.assignedTargets(p.initializer);
        if (ts.isSpreadAssignment(p)) return StatusAssignments.assignedTargets(p.expression);
        return [];
      });
    }
    return [inner];
  }

  /**
   * The object of `<expr>.Status`, `<expr>['Status']` or `<expr>[key]` whose key's type is the string literal
   * `'Status'` (parentheses removed), else null.
   */
  private static statusTarget(left: ts.Expression, checker: ts.TypeChecker): ts.Expression | null {
    let inner = left;
    while (ts.isParenthesizedExpression(inner)) inner = inner.expression;
    if (ts.isPropertyAccessExpression(inner) && inner.name.text === 'Status') return inner.expression;
    if (!ts.isElementAccessExpression(inner)) return null;
    if (ts.isStringLiteralLike(inner.argumentExpression)) return inner.argumentExpression.text === 'Status' ? inner.expression : null;
    const key = checker.getTypeAtLocation(inner.argumentExpression);
    return key.isStringLiteral() && key.value === 'Status' ? inner.expression : null;
  }

  /** Calls `hit` with the line and form of each `Set`/`SetMany`/`Object.assign` call that writes an ML model's `Status`. */
  private static visitCalls(source: ts.SourceFile, checker: ts.TypeChecker, hit: (line: number, form: StatusWriteCall['Form']) => void): void {
    const walk = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        const form = StatusAssignments.statusCallForm(node, checker);
        if (form !== null) hit(source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, form);
      }
      ts.forEachChild(node, walk);
    };
    walk(source);
  }

  /** The form of a call that writes an ML model's `Status` through a method rather than an assignment, else null. */
  private static statusCallForm(call: ts.CallExpression, checker: ts.TypeChecker): StatusWriteCall['Form'] | null {
    const callee = call.expression;
    if (!ts.isPropertyAccessExpression(callee)) return null;
    const [first, second] = call.arguments;
    const isModel = (e: ts.Expression | undefined): boolean => e !== undefined && StatusAssignments.isModelType(checker.getTypeAtLocation(e), checker, new Set());
    const namesStatus = (e: ts.Expression | undefined): boolean =>
      e !== undefined && ts.isObjectLiteralExpression(e) && e.properties.some((p) => p.name !== undefined && ts.isIdentifier(p.name) && p.name.text === 'Status');
    if (callee.name.text === 'Set' && first !== undefined && ts.isStringLiteralLike(first) && first.text === 'Status' && isModel(callee.expression)) return "Set('Status')";
    if (callee.name.text === 'SetMany' && namesStatus(first) && isModel(callee.expression)) return 'SetMany({ Status })';
    if (ts.isIdentifier(callee.expression) && callee.expression.text === 'Object' && callee.name.text === 'assign' && isModel(first) && namesStatus(second)) {
      return 'Object.assign(model, { Status })';
    }
    return null;
  }

  /** Whether `type`, a member of its union or intersection, or one of its base classes is named `MJMLModelEntity`. */
  private static isModelType(type: ts.Type, checker: ts.TypeChecker, seen: Set<ts.Type>): boolean {
    if (seen.has(type)) return false;
    seen.add(type);
    if (type.isUnionOrIntersection()) return type.types.some((t) => StatusAssignments.isModelType(t, checker, seen));
    const symbol = type.getSymbol();
    if (symbol !== undefined && symbol.getName() === 'MJMLModelEntity') return true;
    if (!type.isClassOrInterface()) return false;
    return checker.getBaseTypes(type).some((t) => StatusAssignments.isModelType(t, checker, seen));
  }
}

/** The two scanned trees; their program is built once, in `beforeAll`. */
const R0_ROOTS: readonly string[] = ['packages/AI/PredictiveStudio', 'packages/Angular'];

/** Building the R0 program takes 15-30 s alone and more under load; it is setup, not a test (D5-52 follow-up). */
const PROGRAM_BUILD_TIMEOUT_MS = 300_000;

describe('R0 one publish function: no Status write outside the lifecycle gate (static scan)', () => {
  beforeAll(() => StatusAssignments.Prepare(R0_ROOTS), PROGRAM_BUILD_TIMEOUT_MS);

  it('finds no Status assignment to an ML model outside the lifecycle gate', () => {
    expect(StatusAssignments.Scan(R0_ROOTS, { Allow: ['registry/lifecycle-gate.ts'] })).toEqual([]);
  }, 60_000);

  it('reports (does not fail on) Set / SetMany / Object.assign calls that write an ML model\'s Status outside the lifecycle gate', () => {
    const calls = StatusAssignments.ScanCalls(R0_ROOTS, { Allow: ['registry/lifecycle-gate.ts'] });
    for (const c of calls) console.warn(`R0 report (not a failure): ${c.File}:${c.Line} ${c.Form}`);
    expect(Array.isArray(calls)).toBe(true);
  }, 60_000);

  describe('the scan finds a planted assignment', () => {
    let scratch = '';
    beforeAll(() => {
      scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-r0-scan-'));
      fs.mkdirSync(path.join(scratch, 'src'));
      fs.writeFileSync(
        path.join(scratch, 'src', 'planted.ts'),
        [
          '/** A local stand-in named as the generated class, so the scratch file needs no package. */',
          'export class MJMLModelEntity { public Status = \'Draft\'; public Set(_f: string, _v: string): void {} public SetMany(_o: { Status?: string }): void {} }',
          'export class MJMLModelEntityServer extends MJMLModelEntity {}',
          'export class MJMLTrainingRunEntity { public Status = \'Running\'; public Set(_f: string, _v: string): void {} }',
          'export function Plant(model: MJMLModelEntity, server: MJMLModelEntityServer | null, run: MJMLTrainingRunEntity): void {',
          '  model.Status = \'Published\';',
          '  if (server !== null) server[\'Status\'] = \'Archived\';',
          '  run.Status = \'Completed\';',
          '  const same = model.Status === \'Published\';',
          '  void same;',
          '  ({ Status: model.Status } = { Status: \'Draft\' });',
          '  [model.Status] = [\'Draft\'];',
          '  const key = \'Status\';',
          '  model[key] = \'Draft\';',
          '  [run.Status] = [\'Failed\'];',
          '  model.Set(\'Status\', \'Draft\');',
          '  model.SetMany({ Status: \'Draft\' });',
          '  Object.assign(model, { Status: \'Draft\' });',
          '  run.Set(\'Status\', \'Failed\');',
          '}',
          '',
        ].join('\n'),
      );
    });
    afterAll(() => {
      fs.rmSync(scratch, { recursive: true, force: true });
    });

    it('names the file and line of each ML model Status assignment — a subclass, element access, destructuring targets and a literal-typed key included — and nothing else', () => {
      const file = path.relative(StatusAssignments.RepositoryRoot(), path.join(scratch, 'src', 'planted.ts')).split(path.sep).join('/');
      expect(StatusAssignments.Scan([scratch], { Allow: [] })).toEqual([6, 7, 11, 12, 14].map((line) => ({ File: file, Line: line })));
      expect(StatusAssignments.Scan([scratch], { Allow: ['src/planted.ts'] })).toEqual([]);
    }, 60_000);

    it('does not type-check a generated class-registration manifest, which only imports and lists classes', () => {
      const generated = path.join(scratch, 'src', 'generated');
      fs.mkdirSync(generated, { recursive: true });
      for (const name of ['mj-class-registrations.ts', 'class-registrations-manifest.ts']) {
        fs.writeFileSync(path.join(generated, name), "import { MJMLModelEntity } from '@memberjunction/not-built-here';\nexport const CLASSES = [MJMLModelEntity];\n");
      }
      const candidates = StatusAssignments.Candidates(scratch).map((f) => path.basename(f));
      expect(candidates).toEqual(['planted.ts']);
    }, 60_000);

    it('scans past an unresolved import of a package that cannot carry an ML model type, and fails on one that can', () => {
      const other = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-r0-imports-'));
      try {
        fs.mkdirSync(path.join(other, 'src'));
        const file = path.join(other, 'src', 'form.ts');
        fs.writeFileSync(file, "import { Harness } from '@memberjunction/ng-not-built-here';\nexport const h: Harness | null = null;\nexport function f(a: { Status: string }): void { a.Status = 'x'; }\n");
        expect(StatusAssignments.Scan([other], { Allow: [] })).toEqual([]);
        fs.writeFileSync(file, "import { Thing } from '@memberjunction/core-entities-not-built';\nexport function f(a: { Status: string }): void { a.Status = 'x'; }\nexport const t: Thing | null = null;\n");
        expect(StatusAssignments.ModelTypeSource('@memberjunction/core-entities')).toBe(true);
        expect(StatusAssignments.ModelTypeSource('@memberjunction/predictive-studio-core')).toBe(true);
        expect(StatusAssignments.ModelTypeSource('@memberjunction/ng-ai-test-harness')).toBe(false);
      } finally {
        fs.rmSync(other, { recursive: true, force: true });
      }
    }, 60_000);

    it('reports the Set / SetMany / Object.assign calls on an ML model with their form, and not those on another entity', () => {
      const file = path.relative(StatusAssignments.RepositoryRoot(), path.join(scratch, 'src', 'planted.ts')).split(path.sep).join('/');
      expect(StatusAssignments.ScanCalls([scratch], { Allow: [] })).toEqual([
        { File: file, Line: 16, Form: "Set('Status')" },
        { File: file, Line: 17, Form: 'SetMany({ Status })' },
        { File: file, Line: 18, Form: 'Object.assign(model, { Status })' },
      ]);
    }, 60_000);
  });
});
