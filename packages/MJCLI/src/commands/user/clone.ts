import { Command, Flags } from '@oclif/core';
import chalk from 'chalk';
import { CompositeKey, RunView, type UserInfo } from '@memberjunction/core';
import { MJUserEntity } from '@memberjunction/core-entities';
import { RecordCloneEngine } from '@memberjunction/record-cloning';
import { BuildContextUser, EnsureProviderInitialized } from '../../utils/open-app-context.js';

/** The user being copied, as far as this command needs it. */
interface SourceUserRow {
  ID: string;
  Email: string;
  IsTemplate: boolean;
}

/**
 * CLI command: `mj user clone`.
 *
 * Creates a new user as a copy of an existing one through the `MJ: Users` clone configuration. From a
 * template user (IsTemplate) the default `template` preset copies everything the template was set up
 * with, dashboards and conversations included; from an ordinary user, choose one of the other presets.
 * Runs as the system user, so it needs no sign-in; it is meant for administrators and install scripts
 * (an app's post-install hook pre-provisions the person who will sign in).
 */
export default class UserClone extends Command {
  static description = 'Create a user as a copy of another (a template user by default)';

  static examples = [
    '<%= config.bin %> user clone --from demo.user@example.org --email jane@example.com --first Jane --last Doe',
    '<%= config.bin %> user clone --from alice@example.com --email bob@example.com --first Bob --last Lee --preset with-settings',
    '<%= config.bin %> user clone --from demo.user@example.org --email jane@example.com --first Jane --last Doe --dry-run',
  ];

  static flags = {
    from: Flags.string({ description: 'Email of the user to copy', required: true }),
    email: Flags.string({ description: 'Email of the new user (the identity they sign in with)', required: true }),
    first: Flags.string({ description: 'First name of the new user', required: true }),
    last: Flags.string({ description: 'Last name of the new user', required: true }),
    preset: Flags.string({
      description: "MJ: Users clone preset: 'template' (template users only), 'with-views', 'with-settings', or none for the base copy",
      default: 'template',
    }),
    inactive: Flags.boolean({ description: 'Leave the new user inactive for review instead of activating it', default: false }),
    'dry-run': Flags.boolean({ description: 'Show what would be copied without creating anything', default: false }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(UserClone);
    try {
      const provider = await EnsureProviderInitialized();
      const contextUser = await BuildContextUser();

      const source = await this.findUser(flags.from, contextUser);
      if (!source) this.error(`No user has the email ${flags.from}.`);
      if (await this.findUser(flags.email, contextUser)) {
        this.error(`A user with the email ${flags.email} already exists. Cloning creates a new user; choose another email.`);
      }
      const preset = flags.preset === 'none' ? undefined : flags.preset;
      if (preset === 'template' && !source.IsTemplate) {
        this.error(`${flags.from} is not a template user. Mark it IsTemplate, or pass --preset with-views, with-settings or none.`);
      }

      const result = await new RecordCloneEngine(provider).Clone(
        {
          EntityName: 'MJ: Users',
          SourceRecordKey: CompositeKey.FromID(source.ID),
          Preset: preset,
          PromptedValues: { Email: flags.email, FirstName: flags.first, LastName: flags.last },
          Options: { DryRun: flags['dry-run'], Reason: `mj user clone from ${flags.from}` },
        },
        contextUser
      );

      for (const w of result.Warnings.filter((w) => w.Severity !== 'Info')) {
        this.log(chalk[w.Severity === 'Error' ? 'red' : 'yellow'](`  ${w.Severity}: ${w.Message}`));
      }
      if (!result.Success) {
        this.error(`Clone ${result.ResultCode === 'BLOCKED' ? 'was blocked' : 'failed'}${result.ErrorMessage ? `: ${result.ErrorMessage}` : ''}.`);
      }

      // A dry run reports the plan's counts; a real run, the rows it actually created.
      const byEntity = new Map<string, number>();
      if (flags['dry-run']) {
        for (const [entity, counts] of Object.entries(result.Counts?.ByEntity ?? {})) byEntity.set(entity, counts.Create);
      } else {
        for (const row of result.Created ?? []) byEntity.set(row.EntityName, (byEntity.get(row.EntityName) ?? 0) + 1);
      }
      this.log(chalk.bold(flags['dry-run'] ? '\nWould copy:' : '\nCopied:'));
      for (const [entity, count] of byEntity) {
        if (count > 0) this.log(`  ${String(count).padStart(5)}  ${entity}`);
      }
      if (flags['dry-run']) return;

      const newID = result.Roots?.[0]?.TargetKey.KeyValuePairs.find((kvp) => kvp.FieldName === 'ID')?.Value;
      if (!flags.inactive && newID) {
        const user = await provider.GetEntityObject<MJUserEntity>('MJ: Users', contextUser);
        if (!(await user.Load(String(newID)))) this.error(`The new user ${flags.email} was created but could not be loaded to activate it.`);
        user.IsActive = true;
        if (!(await user.Save())) this.error(`The new user ${flags.email} was created but not activated: ${user.LatestResult?.CompleteMessage ?? 'unknown error'}`);
      }
      this.log(chalk.green(`\n✓ Created ${flags.email} from ${flags.from}${flags.inactive ? ' (inactive: activate it after review)' : ''}.`));
    } catch (error) {
      this.error(error instanceof Error ? error.message : String(error));
    }
  }

  /** The user with this email, if any. */
  private async findUser(email: string, contextUser: UserInfo): Promise<SourceUserRow | undefined> {
    const result = await new RunView().RunView<SourceUserRow>(
      {
        EntityName: 'MJ: Users',
        ExtraFilter: `Email = '${email.replace(/'/g, "''")}'`,
        Fields: ['ID', 'Email', 'IsTemplate'],
        ResultType: 'simple',
        MaxRows: 1,
        SkipTotalRowCount: true,
      },
      contextUser
    );
    return result.Success ? result.Results[0] : undefined;
  }
}
