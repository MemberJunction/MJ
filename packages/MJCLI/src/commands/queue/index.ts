import { Command } from '@oclif/core';

export default class Queue extends Command {
  static description = 'Operate the durable work queue';

  static examples = [
    '<%= config.bin %> <%= command.id %> publish --topic samples.hello --payload \'{"name":"Paul"}\'',
    '<%= config.bin %> <%= command.id %> stats',
    '<%= config.bin %> <%= command.id %> dead-letters --subscription email.unsubscribe',
  ];

  async run(): Promise<void> {
    this.log('MemberJunction Work Queue\n');
    this.log('  mj queue publish               - Publish test messages to a topic from this machine');
    this.log('  mj queue stats                 - Counts per subscription');
    this.log("  mj queue dead-letters          - List a subscription's dead letters");
    this.log('  mj queue partitions            - List in-flight / blocked partition keys');
    this.log('  mj queue replay                - Replay one dead letter');
    this.log('  mj queue discard               - Discard a pending or dead-lettered delivery, or cancel one in flight');
    this.log('  mj queue backlog               - The autoscaler metric for one subscription');
    this.log('  mj queue work                  - Run subscriptions here: --once for a container job, or until stopped');
    this.log('  mj queue export-topology       - Write the topology manifest for Terraform');
    this.log('  mj queue import-bindings       - Record cloud resource bindings from Terraform output');
    this.log('  mj queue validate-bindings     - Check topology and cloud bindings');
    this.log('\nRun "mj queue COMMAND --help" for details.');
  }
}
