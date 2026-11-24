/**
 * IncrementalBaker — the stateful driver of inline native CodeGen baking (Path C).
 * See `plans/pg-migration-architecture/INLINE_CODEGEN_BAKING_PLAN.md` §4/§6.2.
 *
 * For each SQL Server migration it: transpiles the hand-written DDL + recovers the
 * metadata DML (via `convertMigration`), applies that to a LIVE working PG database,
 * then for each entity the migration's CodeGen block named (`E(M)` — from
 * `MigrationSplitter.extractAffectedEntities`) regenerates the native PG CodeGen
 * objects, executes them against the working DB (so later migrations see current
 * shapes), and bakes the captured SQL inline. The result applies standalone via
 * `mj migrate` with no deploy-time codegen step.
 *
 * This module owns ONLY orchestration + file assembly. The live-database work
 * (apply / refresh-metadata / per-entity generate-and-capture) is injected as a
 * `BakerWorkingDB`, so SQLConverter stays free of a `@memberjunction/codegen-lib`
 * dependency — mirroring how `convertMigration` takes an injected transpiler.
 */
import { ConvertMigration } from './MigrationConverter.js';
import type { TSQLToPGTranspiler, ConversionStatus, UnhandledStatement } from './MigrationConverter.js';

/**
 * Thrown when the working-DB apply/capture fails DURING a bake — carries the already-transpiled
 * `transpiledBody` so the caller can still write it to `.needs-hand` instead of discarding it for a
 * bare error stub (issue #3252 review P2). The transpiled DDL is computed BEFORE the first
 * `db.apply` can throw and is the expensive, useful artifact; a working-DB failure (a dependent-view
 * CASCADE, a mid-sequence metadata corruption) must not throw it away. Distinct from a `convertMigration`
 * failure (which has no body to preserve and propagates as an ordinary error).
 */
export class BakeApplyError extends Error {
  constructor(
    public readonly fileName: string,  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
    public readonly transpiledBody: string,  // case-violation-ok-legacy-back-compat: object literals are assigned to this class, so an accessor stub changes what they must supply
    message: string,
  ) {
    super(message);
    this.name = 'BakeApplyError';
  }
}

/** Native PG CodeGen captured for one entity (the return of `generateSingleEntitySQLToSeparateFiles`). */
export interface CapturedEntitySQL {
  /** Indexes, FK-root helper fns, base view, CRUD sprocs and trigger — with GRANTs inline. */
  sql: string;
  /** Consolidated GRANTs (a duplicate of the inline grants in `sql`; the baker bakes `sql`). */
  permissionsSQL: string;
}

/**
 * Live-database capabilities the baker needs, injected by the caller (MJCLI wires these to
 * `@memberjunction/codegen-lib` + a `pg` pool). The working DB must be seeded to the state
 * just BEFORE the migration being baked, and is left CURRENT after each `bakeMigration`.
 */
export interface BakerWorkingDB {
  /** Execute a transpiled hand-DDL + metadata-DML script against the working DB. */
  apply(sql: string): Promise<void>;
  /** Refresh the in-memory metadata provider so freshly-applied entities/fields are visible. */
  refreshMetadata(): Promise<void>;
  /**
   * Generate native PG CodeGen for one entity (by display name), EXECUTE it against the
   * working DB (keeping the DB current for later migrations), and return the captured SQL.
   */
  captureEntity(entityDisplayName: string): Promise<CapturedEntitySQL>;
  /**
   * Every entity in `schema` that CodeGen generates objects for, in generation order — the set
   * `mj codegen` would process for that schema (`IncludeInAPI`, minus excluded schemas). A
   * baseline has NO CodeGen banners, so `MigrationSplitter.extractAffectedEntities` yields `[]`;
   * baking a baseline instead captures native CodeGen for THIS set (see `bakeMigration`).
   *
   * `schema` is the baker's target schema. The working database also holds MJ core and every
   * dependency app, and a baseline owns only its own schema's objects: without the filter an Open
   * App's baseline baked all of core's and its dependencies' views and routines (issue #5364).
   * {@link SelectBakeableEntities} implements the selection over the provider's entity list.
   */
  listBakeableEntities(schema: string): Promise<string[]>;
  /**
   * Run PostgreSQL's EntityField sync (`spUpdateExistingEntityFieldsFromSchema`, after ensuring
   * CodeGen's metadata support objects) for the named entities and return the EntityField
   * `DefaultValue` changes it made (issue #5650). Called after a migration's hand body is applied
   * and before the capture, so a default the migration added to an existing column reaches the
   * metadata the baked `spCreate…` is generated from. Optional: a working DB without it bakes as
   * before.
   */
  syncFieldDefaults?(entityDisplayNames: string[]): Promise<FieldDefaultChange[]>;
}

/** One EntityField row as {@link BakerWorkingDB.syncFieldDefaults} snapshots it. */
export interface EntityFieldDefault {
  ID: string;
  EntityName: string;
  FieldName: string;
  DefaultValue: string | null;
}

/** A `DefaultValue` the field sync changed: the row after the sync, with the value before it. */
export interface FieldDefaultChange extends EntityFieldDefault {
  PreviousDefaultValue: string | null;
}

/**
 * The `DefaultValue` changes between two EntityField snapshots, matched on ID (case-insensitive),
 * in `after` order. A row present only after the sync (a new field) is not a change: its
 * registration already carries the default.
 */
export function DiffFieldDefaults(
  before: ReadonlyArray<EntityFieldDefault>,
  after: ReadonlyArray<EntityFieldDefault>,
): FieldDefaultChange[] {
  const prior = new Map(before.map((f) => [f.ID.toLowerCase(), f]));
  const changes: FieldDefaultChange[] = [];
  for (const f of after) {
    const old = prior.get(f.ID.toLowerCase());
    if (old && old.DefaultValue !== f.DefaultValue) changes.push({ ...f, PreviousDefaultValue: old.DefaultValue });
  }
  return changes;
}

/**
 * The EntityField UPDATEs that carry `DefaultValue` changes into a baked migration, so a fresh
 * install (which never runs the field sync) gets the same metadata the bake used (issue #5650).
 */
export function FieldDefaultUpdatesSQL(changes: ReadonlyArray<FieldDefaultChange>, coreSchema: string): string {
  if (changes.length === 0) return '';
  const literal = (v: string | null) => (v === null ? 'NULL' : `'${v.replace(/'/g, "''")}'`);
  return [
    '-- EntityField DefaultValue changes from the PostgreSQL field sync (a fresh install does not run it)',
    ...changes.map(
      (c) =>
        `-- ${c.EntityName}.${c.FieldName}\n` +
        `UPDATE ${coreSchema}."EntityField" SET "DefaultValue" = ${literal(c.DefaultValue)} WHERE "ID" = '${c.ID}';`,
    ),
  ].join('\n');
}

/** The entity fields {@link SelectBakeableEntities} reads (a structural subset of `EntityInfo`). */
export interface BakeableEntityCandidate {
  Name: string;
  SchemaName: string;
  IncludeInAPI: boolean;
}

/**
 * Select the entities a baseline bake captures: those CodeGen generates objects for
 * (`IncludeInAPI`, schema not in `excludeSchemas`) that live in `schema`, in input order.
 * Schema names compare case-insensitively, because PostgreSQL folds the unquoted schema an
 * Open App creates (`__mj_BizAppsAccounting` → `__mj_bizappsaccounting`) while entity metadata
 * keeps the mixed-case spelling.
 */
export function SelectBakeableEntities(
  entities: ReadonlyArray<BakeableEntityCandidate>,
  schema: string,
  excludeSchemas: ReadonlyArray<string> = [],
): string[] {
  const target = schema.toLowerCase();
  const excluded = new Set(excludeSchemas.map((s) => s.toLowerCase()));
  return entities
    .filter((e) => e.IncludeInAPI)
    .filter((e) => !excluded.has(e.SchemaName.toLowerCase()))
    .filter((e) => e.SchemaName.toLowerCase() === target)
    .map((e) => e.Name);
}

export interface IncrementalBakerOptions {
  transpiler: TSQLToPGTranspiler;
  db: BakerWorkingDB;
  /** Target schema for the baked output and `search_path`. Defaults to `__mj`. */
  schema?: string;
  /**
   * MJ core schema substituted for `${mjSchema}`. Defaults to `__mj`.
   *
   * Separate from `schema`, which is the APP's schema: an Open App migration references core as
   * `${mjSchema}` and itself as `${flyway:defaultSchema}`, and for every app those differ. The
   * baked body is EXECUTED against the working database, so an unresolved macro is not cosmetic —
   * it fails the apply and halts the bake chain (issue #3838).
   */
  coreSchema?: string;
}

export interface BakedMigrationResult {
  fileName: string;
  /** Conversion status from `convertMigration` (e.g. needs-hand-authoring surfaces here). */
  status: ConversionStatus;
  /** `E(M)` — entities whose native CodeGen was baked, in committed order. */
  affectedEntities: string[];
  /** The standalone baked `.pg.sql` text. */
  pgSQL: string;
  /** Statements the AST transpiler could not handle (reported, never silently dropped). */
  unhandled: UnhandledStatement[];
  /** Hand-written procedural routines the migration carries (require human PG authoring). */
  handProcedural: string[];
  /** Named, non-blocking warnings from the conversion (never a reason not to bake). */
  warnings: string[];
  /**
   * `'baked'` — native CodeGen captured + assembled into `pgSQL`.
   * `'preserved'` — a transpile gap (unhandled statement / hand-procedural) made an auto-bake
   * unsafe, so `pgSQL` is the hand-verified committed file (re-bake mode only).
   * `'gap-no-bake'` — FORWARD mode hit a gap, so the working DB was NOT touched (no apply, no
   * capture) and `pgSQL` is the transpile-only artifact for hand-authoring (issue #3252 RC3).
   */
  mode: 'baked' | 'preserved' | 'gap-no-bake';
}

/** Options for one {@link IncrementalBaker.BakeMigration} call. */
export interface BakeMigrationOptions {
  /**
   * Skip applying the migration to the working DB and only capture its CodeGen: the migration is
   * already applied (a capture that failed after the apply, or a hand-finished file applied by
   * hand). Used by `mj migrate rebake --file … --capture-only` (#6538 item 5, #6348).
   */
  CaptureOnly?: boolean;
}

/** The two regions of a baked `.pg.sql`: everything above the CodeGen section, and the section. */
export interface BakedFileRegions {
  /** Header, hand-written DDL and metadata DML — the part a person may have finished by hand. */
  handRegion: string;
  /** The baked CodeGen section, header line included; empty when the file has none. */
  codeGenSection: string;
}

/** Line that opens the header {@link IncrementalBaker} writes on every baked file. */
const BAKED_HEADER_MARKER = '-- Split-and-regenerate with INLINE NATIVE CodeGen baking';

/**
 * Split a committed `.pg.sql` that the baker wrote (or a `.needs-hand` artifact a person finished)
 * at the CodeGen section header. Returns null for a file the baker did not write — a legacy
 * conversion has no hand/CodeGen boundary to keep.
 */
export function SplitBakedFile(pgSql: string): BakedFileRegions | null {
  if (!pgSql.includes(BAKED_HEADER_MARKER)) return null;
  const at = pgSql.indexOf(CODEGEN_SECTION_HEADER);
  if (at < 0) return { handRegion: pgSql.trimEnd(), codeGenSection: '' };
  return { handRegion: pgSql.slice(0, at).trimEnd(), codeGenSection: pgSql.slice(at).trimEnd() };
}

/** The command that resumes a bake whose capture failed after the migration was applied. */
export function CaptureOnlyResumeCommand(fileName: string): string {
  return `mj migrate rebake --file ${fileName} --capture-only`;
}

const DEFAULT_SCHEMA = '__mj';
/** MJ core's schema — the value `${mjSchema}` resolves to unless the caller overrides it. */
const DEFAULT_CORE_SCHEMA = '__mj';
const CODEGEN_SECTION_HEADER = '-- ===================== CodeGen (native PG, baked) =====================';

/** A baseline migration (`B<timestamp>__…`) — a full from-scratch schema snapshot. Mirrors the
 *  `/^B\d/` test in MigrationConverter's statement-mode baseline handling. */
function isBaselineFile(fileName: string): boolean {
  return /^B\d/.test(fileName);
}

export class IncrementalBaker {
  private readonly schema: string;
  private readonly coreSchema: string;

  constructor(private readonly opts: IncrementalBakerOptions) {
    this.schema = opts.schema ?? DEFAULT_SCHEMA;
    this.coreSchema = opts.coreSchema ?? DEFAULT_CORE_SCHEMA;
  }

  /**
   * Bake one SS migration against the live working DB. Pure of file I/O — caller writes `pgSQL`.
   * Leaves the working DB current for the next migration in the sequence.
   *
   * RE-BAKE mode (`committedPgSql` provided): advance the working DB by applying the known-good
   * committed `.pg.sql` (balanced DROP+CREATE keeps dependent views consistent and registers new
   * entities), then capture native CodeGen READ-ONLY. A transpile gap (unhandled statement or
   * hand-procedural routine) makes an auto-bake incomplete, so the committed file is preserved
   * (`mode: 'preserved'`). This is the robust path for re-baking the committed post-baseline set.
   *
   * FORWARD mode (no `committedPgSql`): apply the transpiled hand body and execute the capture.
   * Known limitation — a new-entity migration's `ALTER COLUMN` preamble CASCADE-drops dependent
   * metadata views (e.g. `vwApplicationSettings`) that per-entity capture doesn't restore, which
   * corrupts the metadata load mid-sequence; prefer the re-bake path for a full set.
   *
   * BASELINE mode (`fileName` is a `B…` baseline): a baseline is a full from-scratch snapshot with
   * NO CodeGen banners, so the banner-derived `affectedEntities` is empty and the "apply the hand
   * body then capture" flow can't bootstrap (the metadata views the provider reads don't exist on
   * an empty DB). Instead the working DB is PRE-SEEDED to the baseline end-state by the caller
   * (v5.x baseline + AST-transpiled deltas → all metadata views present), so we DON'T re-apply the
   * hand body (its tables already exist) — we capture native CodeGen for the FULL entity set and
   * pair it with the file's transpiled hand body. The 5 hand utility functions still surface as
   * gaps (`needs-hand-authoring`); they aren't referenced by base views/sprocs, so the capture is
   * complete regardless and the caller authors them into the final `.pg.sql`.
   */
  async BakeMigration(
    ssSql: string,
    fileName: string,
    committedPgSql?: string,
    options: BakeMigrationOptions = {},
  ): Promise<BakedMigrationResult> {
    const captureOnly = options.CaptureOnly === true;
    const conv = await ConvertMigration(ssSql, fileName, {
      transpiler: this.opts.transpiler,
      schema: this.schema,
      coreSchema: this.coreSchema,
      includeHeader: false,
    });
    const handBody = conv.pgSQL.trim();
    const entities = conv.split.affectedEntities;
    const base = {
      fileName,
      status: conv.status,
      affectedEntities: entities,
      unhandled: conv.unhandled,
      handProcedural: conv.handProcedural,
      warnings: conv.warnings,
    };

    // The transpile-only artifact (header + gap comments + transpiled DDL, no CodeGen). Preserved
    // into `.needs-hand` if the working-DB apply/capture below throws (issue #3252 review P2).
    const transpiledArtifact = this.assemble(fileName, handBody, []);

    if (committedPgSql !== undefined) {
      const regions = SplitBakedFile(committedPgSql);
      return this.applyAndCapture(fileName, committedPgSql, async () => {
        if (!captureOnly) await this.opts.db.apply(committedPgSql); // advance via the known-good committed file
        await this.opts.db.refreshMetadata();
        if (regions) {
          // A file the baker wrote: keep its hand region byte for byte (a person may have finished
          // it) and replace only the CodeGen section. Gaps in the fresh transpile no longer matter,
          // because the transpile is not used (#3345 item 4, #6348).
          if (entities.length === 0) return { ...base, pgSQL: committedPgSql, mode: 'preserved' };
          const captured = await this.captureEntities(entities);
          return { ...base, pgSQL: this.withCodeGenSection(regions.handRegion, captured), mode: 'baked' };
        }
        // A legacy conversion has no hand/CodeGen boundary; rebuild it from the fresh transpile,
        // which is only safe when the transpile has no gaps.
        if (conv.status === 'needs-hand-authoring' || conv.unhandled.length > 0) {
          return { ...base, pgSQL: committedPgSql, mode: 'preserved' };
        }
        const captured = await this.captureEntities(entities);
        return { ...base, pgSQL: this.assemble(fileName, handBody, captured), mode: 'baked' };
      });
    }

    if (isBaselineFile(fileName)) {
      return this.applyAndCapture(fileName, transpiledArtifact, async () => {
        await this.opts.db.refreshMetadata(); // read the pre-seeded metadata
        const allEntities = await this.opts.db.listBakeableEntities(this.schema);
        const captured = await this.captureEntities(allEntities);
        return { ...base, affectedEntities: allEntities, pgSQL: this.assemble(fileName, handBody, captured), mode: 'baked' };
      });
    }

    // FORWARD mode. Gate BEFORE any apply/capture: a gappy conversion must NOT touch the
    // working DB — applying gappy hand DDL crashed the DB or corrupted later bakes (issue
    // #3252 RC3). Placed strictly here (after RE-BAKE and BASELINE, which are legitimately
    // exempt), so those paths are untouched. The transpile-only artifact (header + gap
    // comments + transpiled DDL, no CodeGen) is returned for the caller to write as .needs-hand.
    if (conv.status === 'needs-hand-authoring' || conv.unhandled.length > 0) {
      return { ...base, pgSQL: transpiledArtifact, mode: 'gap-no-bake' };
    }

    return this.applyAndCapture(fileName, transpiledArtifact, async () => {
      if (handBody && !captureOnly) {
        await this.opts.db.apply(this.withSearchPath(handBody));
      }
      // From here on the working DB is advanced past this migration. A capture failure must say
      // so and name the way to resume, or a re-run starts from an inconsistent state (#6538 item 5).
      // (One transaction around apply + capture does not work: CodeGen reads metadata through
      // other pool connections, which cannot see uncommitted DDL.)
      try {
        // Field sync between apply and capture (issue #5650): a default added to an existing column
        // reaches the metadata the capture reads, and the change is baked into the file.
        const defaults = this.opts.db.syncFieldDefaults && entities.length > 0
          ? await this.opts.db.syncFieldDefaults(entities)
          : [];
        await this.opts.db.refreshMetadata();
        const captured = await this.captureEntities(entities);
        const body = [handBody, FieldDefaultUpdatesSQL(defaults, this.coreSchema)].filter((p) => p).join('\n\n');
        return { ...base, pgSQL: this.assemble(fileName, body, captured), mode: 'baked' };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new BakeApplyError(
          fileName,
          transpiledArtifact,
          `CodeGen capture failed after ${fileName} was applied to the working DB (${msg}). ` +
            `The working DB is now past this migration. Finish the .needs-hand file, save it as the ` +
            `.pg.sql counterpart, then resume with: ${CaptureOnlyResumeCommand(fileName)}`,
        );
      }
    });
  }

  /** @deprecated Use {@link BakeMigration}. */
  async bakeMigration(
    ssSql: string,
    fileName: string,
    committedPgSql?: string,
    options: BakeMigrationOptions = {},
  ): Promise<BakedMigrationResult> {
    return this.BakeMigration(ssSql, fileName, committedPgSql, options);
  }

  /**
   * Run one bake path's working-DB apply/capture; on ANY failure, rethrow it as a BakeApplyError
   * carrying `preservedBody` so the CLI can still write the transpiled artifact to `.needs-hand`
   * rather than discard it for a bare error stub (issue #3252 review P2). An already-typed
   * BakeApplyError passes through unwrapped.
   */
  private async applyAndCapture(
    fileName: string,
    preservedBody: string,
    build: () => Promise<BakedMigrationResult>,
  ): Promise<BakedMigrationResult> {
    try {
      return await build();
    } catch (err) {
      if (err instanceof BakeApplyError) throw err;
      throw new BakeApplyError(fileName, preservedBody, err instanceof Error ? err.message : String(err));
    }
  }

  /** Capture native CodeGen for each entity in order; strip volatile headers for determinism. */
  private async captureEntities(entities: string[]): Promise<string[]> {
    const captured: string[] = [];
    for (const entity of entities) {
      const result = await this.opts.db.captureEntity(entity);
      captured.push(StripVolatileHeaders(result.sql).trim());
    }
    return captured;
  }

  /** Build the standalone baked `.pg.sql`: baked header, hand body, then native CodeGen. */
  private assemble(fileName: string, handBody: string, captured: string[]): string {
    const parts: string[] = [this.bakedHeader(fileName)];
    if (handBody) {
      parts.push(handBody);
    }
    if (captured.length > 0) {
      parts.push(CODEGEN_SECTION_HEADER);
      parts.push(captured.join('\n\n'));
    }
    // Belt-and-suspenders: convertMigration already substitutes both schemas; native capture
    // emits literal `__mj`. Replace any stray macro so the baked file is fully literal.
    return parts
      .join('\n\n')
      // Replacement functions, not strings — see MigrationConverter.assemblePgSQL (issue #3171).
      .replaceAll('${flyway:defaultSchema}', () => this.schema)
      .replaceAll('${mjSchema}', () => this.coreSchema) + '\n';
  }

  /** A committed hand region followed by a freshly captured CodeGen section. */
  private withCodeGenSection(handRegion: string, captured: string[]): string {
    const parts = [handRegion.trimEnd()];
    if (captured.length > 0) {
      parts.push(CODEGEN_SECTION_HEADER);
      parts.push(captured.join('\n\n'));
    }
    return parts.join('\n\n') + '\n';
  }

  private bakedHeader(fileName: string): string {
    return [
      '-- ============================================================================',
      `-- MemberJunction PostgreSQL Migration — ${fileName}`,
      '-- Split-and-regenerate with INLINE NATIVE CodeGen baking: hand-written DDL transpiled',
      '-- (AST dialect), metadata DML inline, and CodeGen objects (views/sprocs/triggers/grants)',
      '-- baked natively from `mj codegen`. Applies standalone via `mj migrate` — no deploy codegen.',
      '-- ============================================================================',
      '',
      'CREATE EXTENSION IF NOT EXISTS "pgcrypto";',
      `CREATE SCHEMA IF NOT EXISTS ${this.schema};`,
      `SET search_path TO ${this.schema}, public;`,
      'SET standard_conforming_strings = on;',
    ].join('\n');
  }

  /** Prepend a search_path set so any unqualified identifiers in the hand body resolve. */
  private withSearchPath(sql: string): string {
    return `SET search_path TO ${this.schema}, public;\n${sql}`;
  }
}

/**
 * Strip the native CodeGen header's volatile `-- Generated at: <ISO timestamp>` lines so a
 * re-bake of unchanged input is byte-identical (determinism, plan §7). The deeper fix is a
 * baked-mode flag in `PostgreSQLCodeGenProvider.generateSQLFileHeader` (§6.4); doing it here
 * keeps the change contained to the converter and is provider-agnostic.
 */
export function StripVolatileHeaders(sql: string): string {
  return sql
    .split('\n')
    .filter((line) => !/^\s*--\s*Generated at:/i.test(line))
    .join('\n');
}

/** @deprecated Use {@link StripVolatileHeaders}. */
export function stripVolatileHeaders(sql: string): string {
  return StripVolatileHeaders(sql);
}
