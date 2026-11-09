import { Command, Flags } from '@oclif/core';
import { InitializeProvider, CleanupProvider, GetSystemUser, LoadMJConfig } from '@memberjunction/metadata-sync';
import { ResolveOutputFormat } from '@memberjunction/cli-core';
import { CANONICAL_FORMAT_FLAG } from '../../lib/format-compat.js';
import {
  ApplyValueListFixes,
  CheckConstrainedColumns,
  FormatValueListScan,
  ParseFixTargets,
  ScanValueLists,
  UnknownEntityNames,
  ValueListScanExit,
  WithConsoleOnStderr,
  type ValueListFixResult,
  type ValueListScanReport,
} from '../../lib/value-list-scan.js';

/**
 * `mj doctor value-lists`: finds rows whose `List` field holds a value outside the field's value
 * list. Since 6.1 such a row fails validation on its next save; on 5.x only the database decided,
 * so an upgraded database can hold them. Read-only unless `--fix` names fields.
 */
export default class DoctorValueLists extends Command {
  static description =
    'Find rows whose value-list (ValueListType = List) field holds a value outside its list. Such rows fail validation on their next save. ' +
    'Read-only; --fix sets the named fields to ListOrUserEntry through the entity layer (logged in Record Changes).';

  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --entity "MJ: AI Agents"',
    '<%= config.bin %> <%= command.id %> --format json --fail-on-findings',
    '<%= config.bin %> <%= command.id %> --fix "Projects.Phase,Projects.Status"',
  ];

  static flags = {
    entity: Flags.string({ description: 'Only scan this entity (repeatable)', multiple: true }),
    format: CANONICAL_FORMAT_FLAG,
    'fail-on-findings': Flags.boolean({ description: 'Exit 1 when any field holds values outside its list (for CI)' }),
    fix: Flags.string({
      description: 'Set these fields\' ValueListType to ListOrUserEntry: comma-separated "Entity.Field" names (repeatable). Nothing changes without names.',
      multiple: true,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(DoctorValueLists);
    const { format } = ResolveOutputFormat({ formatFlag: flags.format });
    let targets: ReturnType<typeof ParseFixTargets>;
    try {
      targets = ParseFixTargets(flags.fix ?? []);
    } catch (error: unknown) {
      this.error(error instanceof Error ? error.message : String(error), { exit: 2 });
    }

    const config = LoadMJConfig();
    if (!config) this.error('No mj.config.cjs found in the current directory or a parent directory.');
    let report: ValueListScanReport | undefined;
    let fixes: ValueListFixResult[] = [];
    let unknown: string[] = [];
    // Provider startup prints status lines through the console; keep stdout for the report alone.
    await WithConsoleOnStderr(async () => {
      try {
        const provider = await InitializeProvider(config);
        const user = GetSystemUser();
        // A mistyped --entity would otherwise scan nothing and look clean (exit 0), even with --fail-on-findings.
        unknown = UnknownEntityNames(provider.Entities, flags.entity);
        if (unknown.length === 0) {
          report = await ScanValueLists(provider, provider.Entities, { EntityNames: flags.entity, User: user });
          if (targets.length > 0) {
            fixes = await ApplyValueListFixes(provider, provider.Entities, targets, await CheckConstrainedColumns(provider, user), user);
          }
        }
      } finally {
        await CleanupProvider();
      }
    });

    if (!report) {
      this.logToStderr(`No entity named ${unknown.map((n) => `"${n}"`).join(', ')}. Entity names carry their prefix (for example "MJ: AI Agents").`);
      ValueListScanExit.Exit(2);
      return;
    }

    if (format === 'json') {
      this.log(JSON.stringify(targets.length > 0 ? { ...report, Fixes: fixes } : report, null, 2));
    } else {
      for (const line of FormatValueListScan(report)) this.log(line);
      for (const fix of fixes) this.log(`${fix.Fixed ? 'fixed' : 'not fixed'}: ${fix.Entity}.${fix.Field}: ${fix.Message}`);
      if (fixes.some((f) => f.Fixed)) this.log('Restart MJAPI so its metadata cache picks up the change.');
    }

    const failed = (flags['fail-on-findings'] && report.Findings.length > 0) || fixes.some((f) => !f.Fixed);
    ValueListScanExit.Exit(failed ? 1 : 0);
  }
}
