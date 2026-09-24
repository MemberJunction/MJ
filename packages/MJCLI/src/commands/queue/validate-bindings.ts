import { Command, Flags } from '@oclif/core';
import { WorkQueueValidateBindingsOperation } from '@memberjunction/core-entities';
import { FormatBindingIssues, HasBindingErrors, RequireOperationOutput } from '../../lib/work-queue/queue-format.js';
import { OpenWorkQueueSession } from '../../lib/work-queue/queue-session.js';

export default class QueueValidateBindings extends Command {
  static description = 'Validate work-queue topology and cloud bindings; exits 1 on any error';

  static examples = ['<%= config.bin %> <%= command.id %>', '<%= config.bin %> <%= command.id %> --transport AWS-prod'];

  static flags = {
    transport: Flags.string({ char: 't', description: "Validate one transport's bindings against its resources" }),
    json: Flags.boolean({ description: 'Print issues as JSON', default: false }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(QueueValidateBindings);
    const session = await OpenWorkQueueSession();
    let failure: string | null = null;
    try {
      const result = await new WorkQueueValidateBindingsOperation().Execute({ transportName: flags.transport }, { provider: session.Provider, user: session.User });
      const output = RequireOperationOutput(result, 'WorkQueue.ValidateBindings');
      this.log(flags.json ? JSON.stringify(output.issues, null, 2) : FormatBindingIssues(output.issues));
      if (HasBindingErrors(output.issues)) {
        failure = 'Binding validation reported errors.';
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
