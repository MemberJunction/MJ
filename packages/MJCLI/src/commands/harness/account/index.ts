import { Command } from '@oclif/core';

export default class HarnessAccount extends Command {
    static description = 'Manage multi-account CLI subscription pool slots and balancing strategy';

    static examples = [
        '<%= config.bin %> <%= command.id %> list',
        '<%= config.bin %> <%= command.id %> add claude --label "Team Seat"',
        '<%= config.bin %> <%= command.id %> login claude-team-seat',
        '<%= config.bin %> <%= command.id %> set-strategy weighted',
    ];

    public async run(): Promise<void> {
        this.log('MemberJunction Harness Account Pool\n');
        this.log('  mj harness account list                     - List enrolled and OS-default slots');
        this.log('  mj harness account add <vendor>             - Add a new isolated slot (claude, agy, codex, gemini)');
        this.log('  mj harness account login <slotId>           - Re-run interactive CLI login and clear cooldown');
        this.log('  mj harness account remove <slotId>          - Remove an enrolled slot (--purge-files to delete dir)');
        this.log('  mj harness account set-strategy <strategy>  - Set strategy (least-in-flight, round-robin, weighted, priority-failover)');
        this.log('  mj harness account enable <slotId>          - Enable a slot');
        this.log('  mj harness account disable <slotId>         - Disable a slot');
        this.log('  mj harness account clear-cooldown <slotId>  - Clear active quota cooldown on a slot');
        this.log('\nRun "mj harness account COMMAND --help" for details.');
    }
}
