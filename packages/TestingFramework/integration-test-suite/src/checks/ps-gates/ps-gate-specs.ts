/**
 * Shared inputs of the Predictive Studio containment gate bundles: the W-world pipeline spec, the dataset reference
 * narrowing, the source-file walk and string extraction G0.6 judges, and the W1 s42 record-process scoring G0.4 and
 * G0.5 both read.
 */
import path from 'node:path';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { UUIDMap } from '@memberjunction/global';
import type { OutcomeModelLike, RunDetailLike } from '@memberjunction/predictive-studio-core';
import {
  ContainmentProbe,
  DatasetCatalog,
  RunFixtures,
  TruthSuite,
  W_WORLD_DENY_FIELDS,
  W_WORLD_FEATURES,
  type AlgorithmKey,
  type CatalogEntry,
  type DatasetRef,
  type LoadedDataset,
  type PipelineSpec,
  type TruthHarness,
} from '@memberjunction/predictive-studio-truth-suite';

/** The W1 s42 record-process scoring: its details, the model as the Predictions resource reads it, and the truth file. */
export interface W1RecordProcessScoring {
  Details: RunDetailLike[];
  Model: OutcomeModelLike;
  TruthCsv: string;
}

/** Pipeline specs, dataset references and source scanning for the PS gate bundles. */
export class PsGateSpecs {
  /** The repository root (TruthSuite → PredictiveStudio → AI → packages → root). */
  public static readonly MJRoot: string = path.resolve(TruthSuite.Root(), '../../../..');

  /** The four classification algorithms the agent-run gates offer the builder. */
  public static readonly Algorithms: readonly AlgorithmKey[] = ['logistic_regression', 'xgboost', 'lightgbm', 'random_forest'];

  /** The write-back mapping G0.7 scores with (the score lands in the dataset's `TruthScore` column). */
  public static readonly WriteBack = { OutputMapping: { fields: { TruthScore: '$.score' } } };

  /** Core's modules whose strings a person reads (verdict copy, outcome labels, importance notes, the withheld reason). */
  public static readonly CoreCopyModules: readonly string[] = ['trust.ts', 'outcome-config.ts', 'importance-display.ts', 'evaluation-record.ts'];

  private static w1RecordProcessPromise: Promise<W1RecordProcessScoring> | null = null;

  /** A W-world pipeline spec named `PSTruth: <tag> <RunID>` with the containment defaults, overridden by `over`. */
  public static W(h: TruthHarness, tag: string, dataset: LoadedDataset, over: Partial<PipelineSpec> = {}): PipelineSpec {
    return {
      Name: `PSTruth: ${tag} ${h.RunID}`,
      Dataset: dataset,
      Target: 'Renewed',
      ProblemType: 'classification',
      Features: [...W_WORLD_FEATURES],
      Algorithm: 'logistic_regression',
      AsOf: { Mode: 'none' },
      Validation: { Strategy: 'train_test_split', LockedHoldoutFraction: 0.2 },
      DenyFields: [...W_WORLD_DENY_FIELDS],
      ...over,
    };
  }

  /** The dataset reference of one catalog entry and seed; throws for a code outside the world/scenario unions. */
  public static Ref(kind: CatalogEntry['Kind'], code: string, seed: number): DatasetRef {
    if (kind === 'world' && DatasetCatalog.IsWorldID(code)) return { Kind: 'world', ID: code, Seed: seed };
    if (kind === 'scenario' && DatasetCatalog.IsScenarioID(code)) return { Kind: 'scenario', ID: code, Seed: seed };
    throw new Error(`${kind} '${code}' is not a dataset of the truth-suite catalog`);
  }

  /** Every file under `dir` (recursively) that `keep` accepts. */
  public static Walk(dir: string, keep: (f: string) => boolean): string[] {
    return readdirSync(dir).flatMap((n) => {
      const f = path.join(dir, n);
      return statSync(f).isDirectory() ? PsGateSpecs.Walk(f, keep) : keep(f) ? [f] : [];
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
      ...PsGateSpecs.Walk(path.join(root, 'packages/Angular/Explorer/dashboards/src/PredictiveStudio'),
        (f) => /\.(ts|html)$/.test(f) && !/\.test\.ts$/.test(f)),
      ...PsGateSpecs.CoreCopyModules.map((f) => path.join(core, f)),
      ...ContainmentProbe.StoryPromptFiles(root),
    ];
  }

  /**
   * The user-facing text of each file (label: its path from the repository root), de-duplicated across files in
   * first-seen order; files with none are left out. TS/JS gives its string and template literals (comments and regex
   * literals skipped, template literals across lines kept whole, and no thrown errors, console/log text, type unions or
   * tool descriptions); HTML (an .html file, or an inline Angular template literal) gives its text nodes and quoted
   * attribute values; a Markdown prompt is one text. Inline CSS is dropped, and only prose is kept (two or more plain
   * words), so identifiers, CSS classes, icon names, paths and template control flow do not reach the judge.
   */
  public static UserFacingTexts(files: readonly string[]): Array<{ Label: string; Texts: string[] }> {
    const seen = new Set<string>();
    const groups: Array<{ Label: string; Texts: string[] }> = [];
    for (const file of files) {
      const texts: string[] = [];
      for (const text of PsGateSpecs.fileTexts(file, readFileSync(file, 'utf8'))) {
        for (const piece of PsGateSpecs.pieces(text)) {
          const t = piece.replace(/\s+/g, ' ').trim();
          if (PsGateSpecs.isProse(t) && !seen.has(t)) {
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
    return /\.(ts|js)$/.test(file) ? SourceLiterals.Extract(source) : [source];
  }

  /**
   * One extracted text split into what a person reads: HTML into its texts, a stylesheet into nothing, anything else
   * whole. A stylesheet starts with a selector and a `{` holding a `property: value;` declaration, so prose that
   * contains a JSON example (`{"Name": …}`) is kept.
   */
  private static pieces(text: string): string[] {
    if (/<[A-Za-z][^>]*>/.test(text)) return PsGateSpecs.htmlTexts(text);
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

  /**
   * The W1 s42 record-process scoring of the Validated fixture model (NA, 2024), memoised for the process: G0.4 and G0.5
   * read the same scoring. The details and lineage are plain data, so they stay valid after a bundle's teardown.
   */
  public static W1RecordProcess(h: TruthHarness): Promise<W1RecordProcessScoring> {
    PsGateSpecs.w1RecordProcessPromise ||= PsGateSpecs.scoreW1RecordProcess(h);
    return PsGateSpecs.w1RecordProcessPromise;
  }

  /** TrueP by MembershipYearID; throws when the truth file lacks either column (never keys rows by "undefined"). */
  public static ReadTrueP(truthCsv: string): UUIDMap<number> {
    const [header, ...rows] = readFileSync(truthCsv, 'utf8').split('\n');
    const cols = (header || '').split(',');
    const id = cols.indexOf('MembershipYearID');
    const p = cols.indexOf('TrueP');
    if (id < 0 || p < 0) throw new Error(`${truthCsv} has no MembershipYearID/TrueP columns`);
    const out = new UUIDMap<number>();
    for (const r of rows) {
      const c = r.split(',');
      const recordId = c[id];
      if (recordId) out.Set(recordId, Number(c[p]));
    }
    return out;
  }

  private static async scoreW1RecordProcess(h: TruthHarness): Promise<W1RecordProcessScoring> {
    const w1 = await h.EnsureLoaded({ Kind: 'world', ID: 'W1-signal', Seed: 42 });
    const model = await RunFixtures.W1S42ValidatedModel(h);
    const run = await h.ScoreViaRecordProcess(model.ModelID, w1, "Region = 'NA' AND [Year] = 2024");
    if (run.Status !== 'Completed') throw new Error(`record-process scoring ended ${run.Status}`);
    return {
      TruthCsv: path.join(w1.Dir, 'truth.csv'),
      Details: run.Details.map((d) => ({ RecordID: d.RecordID, ResultPayload: d.ResultPayload })),
      Model: { Lineage: model.LineageJSON, TargetVariable: 'Renewed', ProblemType: 'classification' },
    };
  }
}

/** A linear scanner over a whole TS/JS source that returns its string and template literals, skipping comments. */
class SourceLiterals {
  /** The literals of `source`; a template's `${…}` expressions become `{…}`. */
  public static Extract(source: string): string[] {
    const out: string[] = [];
    let i = 0;
    let statementStart = 0; // after the last top-level `;`, `{` or `}` (literal contents are skipped, so theirs never count)
    while (i < source.length) {
      const ch = source[i];
      if (ch === ';' || ch === '{' || ch === '}') {
        statementStart = i + 1;
        i += 1;
      } else if (ch === '/' && source[i + 1] === '/') {
        i = SourceLiterals.endOfLine(source, i);
      } else if (ch === '/' && source[i + 1] === '*') {
        const end = source.indexOf('*/', i + 2);
        i = end < 0 ? source.length : end + 2;
      } else if (ch === '/' && SourceLiterals.startsRegex(source, i)) {
        i = SourceLiterals.regexEnd(source, i);
      } else if (ch === "'" || ch === '"') {
        const q = SourceLiterals.quoted(source, i);
        if (q.Text !== null) SourceLiterals.emit(out, source, statementStart, i, q.End, q.Text);
        i = q.End;
      } else if (ch === '`') {
        const t = SourceLiterals.template(source, i, out, statementStart);
        SourceLiterals.emit(out, source, statementStart, i, t.End, t.Text);
        i = t.End;
      } else {
        i += 1;
      }
    }
    return out;
  }

  /**
   * Add `text` (the literal spanning `start`..`end`) unless its context says no person reads it: a thrown or
   * constructed error (or an Error subclass's `super(…)` message), console or log output, a member of a type union, or a tool/property description for a model.
   */
  private static emit(out: string[], source: string, statementStart: number, start: number, end: number, text: string): void {
    const statement = source.slice(statementStart, start);
    if (/\bthrow\b|\bnew\s+\w*Error\s*\(|\bconsole\.\w+\s*\(|\bLog(Error|Status|Warning)\w*\s*\(/.test(statement)) return;
    if (/\bsuper\s*\(/.test(statement) && /\bextends\s+\w*Error\b/.test(source.slice(Math.max(0, start - 600), start))) return;
    if (/(^|[^|])\|\s*$|\btype\s+\w+(<[^>]*>)?\s*=\s*$/.test(statement) || /^\s*\|(?!\|)/.test(source.slice(end, end + 8))) return;
    if (SourceLiterals.isToolDescription(statement, source.slice(end, end + 600))) return;
    out.push(text);
  }

  /**
   * A description written for a model, not a person: a JSON-schema `description:`, or a `Description:` of a tool
   * definition (an object that also declares a `ParameterSchema`). Other `Description:` values (outcome band copy) stay.
   */
  private static isToolDescription(statement: string, after: string): boolean {
    if (/\bdescription['"]?\s*:\s*$/.test(statement)) return true;
    return /\bDescription['"]?\s*:\s*$/.test(statement) && /^[^}]*\bParameterSchema\b/.test(after);
  }

  /** A `/` starts a regex literal (not a division) when the previous significant character cannot end an operand. */
  private static startsRegex(source: string, at: number): boolean {
    let j = at - 1;
    while (j >= 0 && /\s/.test(source[j] || '')) j -= 1;
    if (j < 0) return true;
    if ('(,=:[!&|?{};+-*%<>~^'.includes(source[j] || '')) return true;
    return /\b(return|typeof|case|in|of)$/.test(source.slice(Math.max(0, j - 6), j + 1));
  }

  /** The index after a regex literal starting at `start` (escapes and `[…]` classes honoured; a newline ends it). */
  private static regexEnd(source: string, start: number): number {
    let inClass = false;
    for (let i = start + 1; i < source.length; i++) {
      const c = source[i];
      if (c === '\\') i += 1;
      else if (c === '\n') return i;
      else if (inClass) inClass = c !== ']';
      else if (c === '[') inClass = true;
      else if (c === '/') return i + 1;
    }
    return source.length;
  }

  private static endOfLine(source: string, from: number): number {
    const nl = source.indexOf('\n', from);
    return nl < 0 ? source.length : nl;
  }

  /**
   * A '…' or "…" literal starting at `start`. A quote literal cannot span lines, so one that reaches a newline was not
   * a literal (a quote inside a regex) and yields no text; scanning resumes after the opening quote.
   */
  private static quoted(source: string, start: number): { Text: string | null; End: number } {
    const quote = source[start];
    let buf = '';
    for (let i = start + 1; i < source.length; i++) {
      const c = source[i];
      if (c === '\\' && i + 1 < source.length) {
        buf += source[i + 1];
        i += 1;
      } else if (c === quote) {
        return { Text: buf, End: i + 1 };
      } else if (c === '\n') {
        return { Text: null, End: start + 1 };
      } else {
        buf += c;
      }
    }
    return { Text: null, End: start + 1 };
  }

  /**
   * A template literal starting at `start`; literals nested inside its `${…}` expressions are pushed to `out`, judged
   * by the enclosing statement (from `statementStart`).
   */
  private static template(source: string, start: number, out: string[], statementStart: number): { Text: string; End: number } {
    let buf = '';
    let i = start + 1;
    while (i < source.length) {
      const c = source[i];
      if (c === '\\' && i + 1 < source.length) {
        buf += source[i + 1];
        i += 2;
      } else if (c === '`') {
        return { Text: buf, End: i + 1 };
      } else if (c === '$' && source[i + 1] === '{') {
        i = SourceLiterals.expressionEnd(source, i + 2, out, statementStart);
        buf += '{…}';
      } else {
        buf += c;
        i += 1;
      }
    }
    return { Text: buf, End: source.length };
  }

  /** The index after the `}` closing a `${…}` expression whose body starts at `from` (nested braces and literals skipped). */
  private static expressionEnd(source: string, from: number, out: string[], statementStart: number): number {
    let depth = 1;
    let i = from;
    while (i < source.length) {
      const c = source[i];
      if (c === '{') {
        depth += 1;
        i += 1;
      } else if (c === '}') {
        depth -= 1;
        i += 1;
        if (depth === 0) return i;
      } else if (c === '/' && SourceLiterals.startsRegex(source, i)) {
        i = SourceLiterals.regexEnd(source, i);
      } else if (c === "'" || c === '"') {
        const q = SourceLiterals.quoted(source, i);
        if (q.Text !== null) SourceLiterals.emit(out, source, statementStart, i, q.End, q.Text);
        i = q.End;
      } else if (c === '`') {
        const t = SourceLiterals.template(source, i, out, statementStart);
        SourceLiterals.emit(out, source, statementStart, i, t.End, t.Text);
        i = t.End;
      } else {
        i += 1;
      }
    }
    return source.length;
  }
}
