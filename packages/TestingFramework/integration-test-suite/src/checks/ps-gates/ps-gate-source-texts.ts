/**
 * The source texts G0.6 judges: the files it scans (the Predictive Studio dashboard UI, Core's copy modules and the story
 * prompt templates) and the user-facing text of each. TS/JS literals come from the TypeScript compiler's own parse
 * (`ts.createSourceFile`), so comments, regex literals and division are told apart the way the compiler tells them apart.
 */
import path from 'node:path';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import ts from 'typescript';
import { ContainmentProbe } from '@memberjunction/predictive-studio-truth-suite';
import { PsGateSpecs } from './ps-gate-specs';

/** One source file's user-facing texts (label: its path from the repository root). */
export interface PsGateSourceTextGroup {
  Label: string;
  Texts: string[];
}

/** The files G0.6 scans and the user-facing texts it hands the judge. */
export class PsGateSourceTexts {
  /** Core's modules whose strings a person reads (verdict copy, outcome labels, importance notes, the withheld reason). */
  public static readonly CoreCopyModules: readonly string[] = ['trust.ts', 'outcome-config.ts', 'importance-display.ts', 'evaluation-record.ts'];

  /** Every file under `dir` (recursively) that `keep` accepts. */
  public static Walk(dir: string, keep: (f: string) => boolean): string[] {
    return readdirSync(dir).flatMap((n) => {
      const f = path.join(dir, n);
      return statSync(f).isDirectory() ? PsGateSourceTexts.Walk(f, keep) : keep(f) ? [f] : [];
    });
  }

  /**
   * The files G0.6 judges: the dashboard's Predictive Studio UI (.ts and .html, tests excluded), Core's copy modules and
   * the story prompt templates.
   */
  public static ScannedFiles(): string[] {
    const root = PsGateSpecs.MJRoot;
    const core = path.join(root, 'packages/AI/PredictiveStudio/Core/src');
    return [
      ...PsGateSourceTexts.Walk(path.join(root, 'packages/Angular/Explorer/dashboards/src/PredictiveStudio'),
        (f) => /\.(ts|html)$/.test(f) && !/\.test\.ts$/.test(f)),
      ...PsGateSourceTexts.CoreCopyModules.map((f) => path.join(core, f)),
      ...ContainmentProbe.StoryPromptFiles(root),
    ];
  }

  /**
   * The user-facing text of each file (label: its path from the repository root), de-duplicated across files in
   * first-seen order; files with none are left out. TS/JS gives its string and template literals (see
   * {@link SourceLiterals.Extract}); HTML (an .html file, or an inline Angular template literal) gives its text nodes and
   * quoted attribute values; a Markdown prompt is one text. Inline CSS is dropped, and only prose is kept (two or more
   * plain words), so identifiers, CSS classes, icon names, paths and template control flow do not reach the judge.
   */
  public static UserFacingTexts(files: readonly string[]): PsGateSourceTextGroup[] {
    const seen = new Set<string>();
    const groups: PsGateSourceTextGroup[] = [];
    for (const file of files) {
      const texts: string[] = [];
      for (const text of PsGateSourceTexts.fileTexts(file, readFileSync(file, 'utf8'))) {
        for (const piece of PsGateSourceTexts.pieces(text)) {
          const t = piece.replace(/\s+/g, ' ').trim();
          if (PsGateSourceTexts.isProse(t) && !seen.has(t)) {
            seen.add(t);
            texts.push(t);
          }
        }
      }
      if (texts.length > 0) groups.push({ Label: path.relative(PsGateSpecs.MJRoot, file), Texts: texts });
    }
    return groups;
  }

  /** The texts of one file, by its kind. */
  private static fileTexts(file: string, source: string): string[] {
    // An .html file and a Markdown prompt are one text each; pieces() splits the HTML.
    if (/\.ts$/.test(file)) return SourceLiterals.Extract(source, ts.ScriptKind.TS);
    if (/\.js$/.test(file)) return SourceLiterals.Extract(source, ts.ScriptKind.JS);
    return [source];
  }

  /**
   * One extracted text split into what a person reads: HTML into its texts, a stylesheet into nothing, anything else
   * whole. A stylesheet starts with a selector and a `{` holding a `property: value;` declaration, so prose that
   * contains a JSON example (`{"Name": …}`) is kept.
   */
  private static pieces(text: string): string[] {
    if (/<[A-Za-z][^>]*>/.test(text)) return PsGateSourceTexts.htmlTexts(text);
    if (/^\s*[:.#@a-zA-Z][^{}"']*\{\s*[a-z-]+\s*:\s*[^;{}"]+;/.test(text)) return [];
    return [text];
  }

  /** An HTML template's text nodes and quoted attribute values. */
  private static htmlTexts(source: string): string[] {
    const attributes = [...source.matchAll(/"([^"]*)"/g)].map((m) => m[1] || '');
    const textNodes = source.replace(/<[^>]*>/g, '\n').split('\n');
    return [...textNodes, ...attributes];
  }

  /** Prose: at least two plain words (letters only, optionally followed by punctuation), and not template control flow. */
  private static isProse(text: string): boolean {
    if (/^[@}]/.test(text)) return false;
    return text.split(' ').filter((w) => /^[A-Za-z][A-Za-z']*[.,:;!?)]?$/.test(w)).length >= 2;
  }
}

/**
 * The string and template literals of a TS/JS source, read from the TypeScript compiler's syntax tree. Literals no
 * person reads are left out with the subtree that holds them: types, import/export specifiers, thrown or constructed
 * errors (and an Error subclass's `super(…)` message), console and log output, and descriptions written for a model.
 */
export class SourceLiterals {
  /** The literals of `source` in document order; a template's `${…}` expressions become `{…}`. */
  public static Extract(source: string, kind: ts.ScriptKind = ts.ScriptKind.TS): string[] {
    const file = ts.createSourceFile(kind === ts.ScriptKind.JS ? 'source.js' : 'source.ts', source, ts.ScriptTarget.Latest, true, kind);
    const out: string[] = [];
    SourceLiterals.visit(file, out);
    return out;
  }

  /** Emit `node`'s text when it is a user-facing literal, then walk its children, unless no person reads its subtree. */
  private static visit(node: ts.Node, out: string[]): void {
    if (SourceLiterals.isSilentSubtree(node)) return;
    const text = SourceLiterals.literalText(node);
    if (text !== null && !SourceLiterals.isToolDescription(node)) out.push(text);
    ts.forEachChild(node, (child) => SourceLiterals.visit(child, out));
  }

  /** The text of a string, plain template or substitution template literal (`${…}` as `{…}`); null for anything else. */
  private static literalText(node: ts.Node): string | null {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
    if (ts.isTemplateExpression(node)) return node.head.text + node.templateSpans.map((s) => `{…}${s.literal.text}`).join('');
    return null;
  }

  /** A subtree whose literals no person reads. */
  private static isSilentSubtree(node: ts.Node): boolean {
    if (ts.isTypeNode(node) || ts.isImportDeclaration(node) || ts.isExportDeclaration(node) || ts.isImportEqualsDeclaration(node)) return true;
    if (ts.isThrowStatement(node)) return true;
    if (ts.isNewExpression(node)) return /Error$/.test(SourceLiterals.calleeName(node.expression));
    if (ts.isCallExpression(node)) return SourceLiterals.isLogCall(node) || SourceLiterals.isErrorSuperCall(node);
    return false;
  }

  /** `console.x(…)` or a `Log(Error|Status|Warning)…(…)` call. */
  private static isLogCall(call: ts.CallExpression): boolean {
    const callee = call.expression;
    if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) && callee.expression.text === 'console') return true;
    return /^Log(Error|Status|Warning)/.test(SourceLiterals.calleeName(callee));
  }

  /** `super(…)` inside a class that extends an `…Error` class: the message of a thrown error. */
  private static isErrorSuperCall(call: ts.CallExpression): boolean {
    if (call.expression.kind !== ts.SyntaxKind.SuperKeyword) return false;
    let n: ts.Node | undefined = call.parent;
    while (n && !ts.isClassLike(n)) n = n.parent;
    const base = n?.heritageClauses?.find((h) => h.token === ts.SyntaxKind.ExtendsKeyword)?.types[0];
    return base !== undefined && /Error$/.test(SourceLiterals.calleeName(base.expression));
  }

  /** The called name: `Foo` for `Foo(…)` / `new Foo(…)`, `Bar` for `x.Bar(…)`; empty for anything else. */
  private static calleeName(callee: ts.Expression): string {
    if (ts.isIdentifier(callee)) return callee.text;
    if (ts.isPropertyAccessExpression(callee)) return callee.name.text;
    return '';
  }

  /**
   * A description written for a model, not a person: a JSON-schema `description:`, or a `Description:` of a tool
   * definition (an object that also declares a `ParameterSchema`). Other `Description:` values (outcome band copy) stay.
   */
  private static isToolDescription(node: ts.Node): boolean {
    const prop = node.parent;
    if (!prop || !ts.isPropertyAssignment(prop) || prop.initializer !== node) return false;
    const name = SourceLiterals.propertyName(prop.name);
    if (name === 'description') return true;
    return name === 'Description' && ts.isObjectLiteralExpression(prop.parent)
      && prop.parent.properties.some((p) => p.name !== undefined && SourceLiterals.propertyName(p.name) === 'ParameterSchema');
  }

  /** An identifier or string-literal property name's text; empty for a computed or numeric name. */
  private static propertyName(name: ts.PropertyName): string {
    return ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : '';
  }
}
