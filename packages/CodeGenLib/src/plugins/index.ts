/**
 * Pluggable `mj codegen` command (plan §3/§5).
 *
 * Lives behind the `@memberjunction/codegen-lib/plugins` subpath so loading it
 * for oclif manifest generation or `mj usage` enumeration does NOT pull in the
 * heavy CodeGen pipeline (which side-effect-imports ~1,400 class registrations).
 * The pipeline is dynamic-imported inside `Execute()`.
 *
 * Stdio discipline (plan D2): no direct `ora`/`console`. In JSON/MD mode the
 * CodeGen spinner is redirected to stderr so stdout carries only the result.
 */
import { Flags, type Interfaces } from '@oclif/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseCLIPlugin, type MJCLIResult, type PluginUsage } from '@memberjunction/cli-core';

/**
 * Flags for {@link CodeGenPlugin}, derived via this package's OWN `@oclif/core`
 * copy so the type is portable here (under `strict` + declaration emit). Passed
 * to `this.GetFlags<CodeGenFlags>()`; the single cross-copy cast lives in
 * BaseCLIPlugin, not here.
 */
type CodeGenFlags = Interfaces.InferredFlags<(typeof CodeGenPlugin)['flags']>;

@RegisterClass(BaseCLIPlugin, 'codegen')
export class CodeGenPlugin extends BaseCLIPlugin {
  static description = `Run the full MemberJunction code generation pipeline.

Analyzes your database schema, updates MemberJunction metadata, and generates
synchronized code across the stack: SQL objects, TypeScript entities, Angular
forms, GraphQL resolvers, Action subclasses, and DB schema JSON.

Use --skipdb to regenerate code from existing metadata only; --skipfiles to run
database-side operations only. --force-advanced-gen re-runs the LLM-driven
advanced generation for ALL entities (bypasses changed-entity scoping).`;

  static examples = [
    { command: '<%= config.bin %> <%= command.id %>', description: 'Run the full code generation pipeline' },
    { command: '<%= config.bin %> <%= command.id %> --skipdb', description: 'Regenerate code files without touching the database' },
    { command: '<%= config.bin %> <%= command.id %> --format=json', description: 'Emit a machine-readable result for an agent' },
  ];

  static flags = {
    skipdb: Flags.boolean({
      description: 'Skip database operations. Only regenerate TypeScript entities, Angular components, and GraphQL resolvers from existing metadata.',
    }),
    skipfiles: Flags.boolean({
      description: 'Skip file-generation operations. Only run database-side operations (metadata sync, SQL object generation).',
    }),
    'force-advanced-gen': Flags.boolean({
      description: 'Bypass entity scoping in Pass 2 and force advanced generation to re-run for all entities.',
    }),
  };

  static Usage: PluginUsage = {
    domain: 'codegen',
    command: 'codegen',
    summary: 'Regenerate entities, SQL, and Angular forms from the database schema.',
    description:
      'Runs the full CodeGen pipeline. Scales with entity count — a full run is far slower than a single-entity change. Use --skipdb/--skipfiles to run only one half.',
    flags: [
      { name: '--skipdb', type: 'boolean', description: 'Regenerate code from existing metadata only (no DB operations)' },
      { name: '--skipfiles', type: 'boolean', description: 'Run DB-side operations only (no code files)' },
      { name: '--force-advanced-gen', type: 'boolean', description: 'Re-run advanced generation for all entities' },
      { name: '--format', type: 'text|json|md', description: 'Output format (json for machine-readable result)' },
    ],
    examples: ['mj codegen', 'mj codegen --skipdb', 'mj codegen --format=json'],
    runtime: { class: 'slow', typicalSeconds: 45, note: 'scales with entity count; full run far slower than a single-entity change' },
  };

  protected async Execute(): Promise<MJCLIResult> {
    const flags = this.GetFlags<CodeGenFlags>();

    const codegen = await import('../index.js');
    const {
      runMemberJunctionCodeGenerationWithResult,
      initializeConfig,
      configInfo,
      setCodeGenSpinnerStream,
    } = codegen;

    // JSON/MD: keep stdout clean for the result by sending the spinner to stderr.
    if (this.Host.Format !== 'text') {
      setCodeGenSpinnerStream(process.stderr);
    }

    initializeConfig(process.cwd());

    // --force-advanced-gen bypasses Pass 2 scoping by toggling the existing
    // forceRegeneration.enabled config flag (honored by both sql_codegen.ts and
    // manage-metadata.ts), giving a uniform "process all entities" override.
    if (flags['force-advanced-gen']) {
      if (!configInfo.forceRegeneration) {
        (configInfo as { forceRegeneration: { enabled: boolean } }).forceRegeneration = { enabled: true };
      } else {
        configInfo.forceRegeneration.enabled = true;
      }
      this.Host.Log('--force-advanced-gen: bypassing entity scoping; advanced generation will re-run for all entities.');
    }

    return runMemberJunctionCodeGenerationWithResult(flags.skipdb, flags.skipfiles);
  }

  /**
   * CodeGen leaves DB connections/pools open; force-exit so the CLI terminates
   * cleanly (mirrors the original `Run()` which called process.exit).
   */
  protected async Cleanup(result: MJCLIResult): Promise<void> {
    process.exit(result.success ? 0 : 1);
  }
}

/** Tree-shaking / dynamic-load anchor — referenced by the CLI plugin loader. */
export function LoadCodeGenPlugins(): void {
  // no-op; importing this module triggers the @RegisterClass decorator above.
}
