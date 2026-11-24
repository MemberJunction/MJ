import { Command } from '@oclif/core';

export default class Harness extends Command {
    static description = 'Manage external agent harness runtime settings and CLI subscription account pools';

    static examples = [
        '<%= config.bin %> <%= command.id %> account list',
        '<%= config.bin %> <%= command.id %> account add claude --label "Pro #2"',
        '<%= config.bin %> <%= command.id %> account set-strategy least-in-flight',
    ];

    public async run(): Promise<void> {
        this.log('MemberJunction Agent Harness\n');
        this.log('  mj harness account list                         - List enrolled and OS-default CLI accounts');
        this.log('  mj harness account add <vendor>                 - Enroll an isolated CLI subscription slot');
        this.log('  mj harness account login <slotId>               - Re-authenticate an existing slot');
        this.log('  mj harness account remove <slotId>              - Remove an enrolled slot');
        this.log('  mj harness account set-strategy <strategy>      - Set default pool balancing strategy');
        this.log('  mj harness account enable <slotId>              - Enable a slot for balancing');
        this.log('  mj harness account disable <slotId>             - Disable a slot from balancing');
        this.log('  mj harness account clear-cooldown <slotId>      - Clear active quota cooldown on a slot');
        this.log('\nRun "mj harness account COMMAND --help" for details.');
    }
}
