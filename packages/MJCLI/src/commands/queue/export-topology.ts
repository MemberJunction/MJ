import { writeFile } from 'node:fs/promises';
import { Command, Flags } from '@oclif/core';
import { WorkQueueEngine } from '@memberjunction/work-queue-engine';
// Registers the 'AWS' transport driver factory and manifest enricher for this command only (work-queue 03 §0).
import '@memberjunction/work-queue-engine/aws';
import { OpenWorkQueueSession } from '../../lib/work-queue/queue-session.js';

export default class QueueExportTopology extends Command {
  static description = 'Write the topology manifest for one transport (input to the Terraform module)';

  static examples = ['<%= config.bin %> <%= command.id %> --transport AWS-prod --output infrastructure/work-queue/manifest.json'];

  static flags = {
    transport: Flags.string({ char: 't', description: 'Transport name', required: true }),
    output: Flags.string({ char: 'o', description: 'File to write; stdout when omitted' }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(QueueExportTopology);
    const session = await OpenWorkQueueSession();
    let failure: string | null = null;
    try {
      await WorkQueueEngine.Instance.Config(false, session.User, session.Provider);
      const manifest = JSON.stringify(WorkQueueEngine.Instance.ExportManifest(flags.transport), null, 2);
      if (flags.output) {
        await writeFile(flags.output, `${manifest}\n`, 'utf8');
        this.log(`Wrote ${flags.output}`);
      } else {
        this.log(manifest);
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
