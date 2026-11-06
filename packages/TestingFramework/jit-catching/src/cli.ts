import { parseArgs } from 'node:util';

export const COMMANDS = ['generate', 'execute', 'assess', 'run', 'recheck', 'feedback', 'backtest', 'label', 'report'] as const;
export type CommandName = (typeof COMMANDS)[number];

/** Parses argv and dispatches one command. Returns the process exit code. */
export async function Main(argv: string[]): Promise<number> {
    const { positionals } = parseArgs({ args: argv, allowPositionals: true, strict: false });
    const command = positionals[0] as CommandName | undefined;
    if (!command || !COMMANDS.includes(command)) {
        process.stderr.write(`usage: jit-catch <${COMMANDS.join('|')}> [options]\n`);
        return 2;
    }
    process.stderr.write(`${command}: not implemented yet\n`);
    return 1;
}
