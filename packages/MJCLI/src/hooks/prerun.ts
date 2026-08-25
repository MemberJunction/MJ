import { Hook } from '@oclif/core';
import figlet from 'figlet';
import { INTERACTIVE_ENV, ResolveOutputFormat, ShouldSuppressChrome } from '@memberjunction/cli-core';
import { LIGHT_COMMANDS } from '../light-commands.js';

/**
 * Strips a global boolean flag from argv in place and reports whether it was there.
 *
 * Global chrome flags have to work on ANY command, including the ~80 that are still
 * plain oclif `Command`s and don't declare them — oclif's strict parser would reject
 * an undeclared flag with "Nonexistent flag". So the hook consumes them here and
 * signals downstream through the environment instead.
 */
function takeGlobalFlag(argv: string[], flag: string): boolean {
  let found = false;
  for (let i = argv.length - 1; i >= 0; i--) {
    if (argv[i] === flag) {
      argv.splice(i, 1);
      found = true;
    }
  }
  return found;
}

/** Reads `--format=x` or `--format x` out of raw argv, before any command has parsed it. */
function readFormatArg(argv: string[]): string | undefined {
  const eq = argv.find((a) => a.startsWith('--format='));
  if (eq) return eq.slice('--format='.length);
  const i = argv.indexOf('--format');
  return i >= 0 ? argv[i + 1] : undefined;
}

const hook: Hook<'prerun'> = async function (options) {
  const argv = options.argv ?? [];

  // `--interactive` / `--no-interactive` override the terminal detection that decides
  // whether a command may prompt. Like `--no-banner` they must work on every command,
  // including the ~80 that don't declare them, so they are consumed here and forwarded
  // via env to both BaseCLIPlugin and the unmigrated commands' interactive guards.
  // BOTH are stripped unconditionally before either is acted on: short-circuiting the
  // second strip would leave the losing flag in argv, where oclif's strict parser
  // rejects it as a nonexistent flag on any command that doesn't declare it.
  const forceOff = takeGlobalFlag(argv, '--no-interactive');
  const forceOn = takeGlobalFlag(argv, '--interactive');
  // Passing both resolves to off — the safe answer when the caller contradicts itself.
  if (forceOff) process.env[INTERACTIVE_ENV] = '0';
  else if (forceOn) process.env[INTERACTIVE_ENV] = '1';

  const noBanner = takeGlobalFlag(argv, '--no-banner');
  if (noBanner) {
    process.env.MJ_CLI_NO_BANNER = '1';
  }

  // Decide chrome with the SAME resolver the commands themselves use, rather than
  // re-deriving the format from argv here. The two views drifting is not hypothetical:
  // while this hook only looked for `--format` in argv, `MJ_CLI_FORMAT=json mj codegen`
  // at a terminal printed a figlet banner and *then* a JSON envelope — the env var the
  // command honours was invisible to the banner decision, and the pipe check that would
  // otherwise have saved us does not fire on a TTY. Routing both through
  // ResolveOutputFormat makes that class of mismatch unrepresentable, and picks up the
  // format aliases (`markdown`, `console`, …) for free.
  const { format } = ResolveOutputFormat({
    formatFlag: readFormatArg(argv),
    // oclif's own `--json` boolean, declared by install:claude / update:claude.
    jsonFlag: argv.includes('--json'),
  });

  const quiet = argv.some((arg) => arg === '--quiet' || (/^-[^-]+/.test(arg) && arg.includes('q')));

  // ShouldSuppressChrome covers both machine formats and a redirected stdout: a caller
  // that piped us has already said it is a machine, and a banner in its capture buffer
  // is pure noise.
  if (noBanner || quiet || ShouldSuppressChrome(format)) {
    // Still conditionally load bootstrap — just no decorative output. (The old `--json`
    // branch returned *without* loading it, which would have silently skipped class
    // registration for any heavy command that later grew a `--json` flag.)
    return await maybeLoadBootstrap(options);
  }

  // Suppress the large figlet banner for hot-path, frequently-run commands (e.g. `mj sync *`)
  // and the agent-facing usage commands, where it's pure scrollback cost. The
  // compact userAgent line below still prints.
  const commandIdForBanner = options.Command.id ?? '';
  const isUsageCommand = commandIdForBanner === 'usage' || commandIdForBanner.endsWith('usage');
  const showFiglet = !commandIdForBanner.startsWith('sync') && !isUsageCommand;

  if (showFiglet) {
    options.context.log(
      process.stdout.columns >= 81
        ? figlet.textSync('MemberJunction', {
            font: 'Standard',
            horizontalLayout: 'default',
            verticalLayout: 'default',
            width: 100,
            whitespaceBreak: true,
          })
        : '~ M e m b e r J u n c t i o n ~'
    );
  }

  // The agent-facing usage commands (`mj usage`, `mj <domain> usage`) are meant to
  // be a terse domain map — skip the userAgent line so text-mode stdout stays clean.
  if (options.Command.id !== 'version' && !isUsageCommand) {
    options.context.log(options.config.userAgent + '\n');
  }

  await maybeLoadBootstrap(options);
};

/**
 * Conditionally load MJ bootstrap for heavy commands. Light commands (version,
 * help, bump, migrate, clean, install, dbdoc/*, usage/*) skip the ~1,400 class
 * registrations for instant startup.
 */
async function maybeLoadBootstrap(options: { Command: { id?: string } }): Promise<void> {
  const commandId = options.Command.id ?? '';
  if (!LIGHT_COMMANDS.has(commandId)) {
    await import('@memberjunction/server-bootstrap-lite/mj-class-registrations');
  }
}

export default hook;
