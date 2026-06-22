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
import { convertMigration } from './MigrationConverter.js';
import type { TSQLToPGTranspiler, ConversionStatus, UnhandledStatement } from './MigrationConverter.js';

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
}

export interface IncrementalBakerOptions {
  transpiler: TSQLToPGTranspiler;
  db: BakerWorkingDB;
  /** Target schema for the baked output and `search_path`. Defaults to `__mj`. */
  schema?: string;
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
  /**
   * `'baked'` — native CodeGen captured + assembled into `pgSQL`.
   * `'preserved'` — a transpile gap (unhandled statement / hand-procedural) made an auto-bake
   * unsafe, so `pgSQL` is the hand-verified committed file (re-bake mode only).
   */
  mode: 'baked' | 'preserved';
}

const DEFAULT_SCHEMA = '__mj';
const CODEGEN_SECTION_HEADER = '-- ===================== CodeGen (native PG, baked) =====================';

export class IncrementalBaker {
  private readonly schema: string;

  constructor(private readonly opts: IncrementalBakerOptions) {
    this.schema = opts.schema ?? DEFAULT_SCHEMA;
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
   */
  async bakeMigration(ssSql: string, fileName: string, committedPgSql?: string): Promise<BakedMigrationResult> {
    const conv = await convertMigration(ssSql, fileName, {
      transpiler: this.opts.transpiler,
      schema: this.schema,
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
    };

    if (committedPgSql !== undefined) {
      await this.opts.db.apply(committedPgSql); // advance via the known-good committed file
      await this.opts.db.refreshMetadata();
      if (conv.status === 'needs-hand-authoring' || conv.unhandled.length > 0) {
        return { ...base, pgSQL: committedPgSql, mode: 'preserved' };
      }
      const captured = await this.captureEntities(entities);
      return { ...base, pgSQL: this.assemble(fileName, handBody, captured), mode: 'baked' };
    }

    if (handBody) {
      await this.opts.db.apply(this.withSearchPath(handBody));
    }
    await this.opts.db.refreshMetadata();
    const captured = await this.captureEntities(entities);
    return { ...base, pgSQL: this.assemble(fileName, handBody, captured), mode: 'baked' };
  }

  /** Capture native CodeGen for each entity in order; strip volatile headers for determinism. */
  private async captureEntities(entities: string[]): Promise<string[]> {
    const captured: string[] = [];
    for (const entity of entities) {
      const result = await this.opts.db.captureEntity(entity);
      captured.push(stripVolatileHeaders(result.sql).trim());
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
    // Belt-and-suspenders: convertMigration already substitutes the schema; native capture
    // emits literal `__mj`. Replace any stray macro so the baked file is fully literal.
    return parts.join('\n\n').replaceAll('${flyway:defaultSchema}', this.schema) + '\n';
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
export function stripVolatileHeaders(sql: string): string {
  return sql
    .split('\n')
    .filter((line) => !/^\s*--\s*Generated at:/i.test(line))
    .join('\n');
}
