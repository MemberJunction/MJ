import { readFile } from 'node:fs/promises';
import { Args, Command, Flags } from '@oclif/core';
import { WorkQueueEngine } from '@memberjunction/work-queue-engine';
import { FormatBindingIssues, HasBindingErrors, ParseBindingImport } from '../../lib/work-queue/queue-format.js';
import { OpenWorkQueueSession } from '../../lib/work-queue/queue-session.js';

export default class QueueImportBindings extends Command {
  static description = 'Record cloud resource bindings (Terraform output) on work-queue topics and subscriptions';

  static examples = ['terraform output -json mj_work_queue_bindings > bindings.json && <%= config.bin %> <%= command.id %> bindings.json'];

  static args = {
    file: Args.string({ description: 'BindingImport JSON file', required: true }),
  };

  static flags = {
    json: Flags.boolean({ description: 'Print issues as JSON', default: false }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(QueueImportBindings);
    const session = await OpenWorkQueueSession();
    let failure: string | null = null;
    try {
      const bindings = ParseBindingImport(await readFile(args.file, 'utf8'));
      await WorkQueueEngine.Instance.Config(false, session.User, session.Provider);
      const issues = await WorkQueueEngine.Instance.ImportBindings(bindings, session.User);
      this.log(flags.json ? JSON.stringify(issues, null, 2) : FormatBindingIssues(issues));
      if (HasBindingErrors(issues)) {
        failure = 'Binding import reported errors.';
      }
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
    } finally {
      await session.Close();
    }
    if (failure) {
      this.error(failure, { exit: 1 });
    }
  }
}
