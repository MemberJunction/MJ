import { Hook } from '@oclif/core';
import figlet from 'figlet';
import { LIGHT_COMMANDS } from '../light-commands.js';

const hook: Hook<'prerun'> = async function (options) {
  const argv = options.argv ?? [];

  // Machine-readable output must keep stdout clean — suppress the banner AND the
  // userAgent line entirely for `--format=json|md` and `--no-banner` (plan §1a/D4).
  const formatArg = ((): string | undefined => {
    const eq = argv.find((a) => a.startsWith('--format='));
    if (eq) return eq.slice('--format='.length);
    const i = argv.indexOf('--format');
    return i >= 0 ? argv[i + 1] : undefined;
  })();
  const machineFormat = formatArg === 'json' || formatArg === 'md';
  const noBanner = argv.includes('--no-banner');

  // `--no-banner` is global chrome — every command renders the banner, so suppressing
  // it must work on ANY command, including those not yet migrated to BaseCLIPlugin
  // (which don't declare the flag and would otherwise fail oclif's strict parser with
  // "Nonexistent flag"). Signal suppression to MJCLIRuntimeHost via env (so migrated
  // commands still gate their runtime advisory) and strip the flag from argv in place
  // so the per-command parser never sees an undeclared flag.
  if (noBanner) {
    process.env.MJ_CLI_NO_BANNER = '1';
    for (let i = argv.length - 1; i >= 0; i--) {
      if (argv[i] === '--no-banner') argv.splice(i, 1);
    }
  }

  // Skip banners if --quiet flag is present (or appears to be present)
  if (machineFormat || noBanner || argv.some((arg) => arg === '--quiet' || (/^-[^-]+/.test(arg) && arg.includes('q')))) {
    // Still conditionally load bootstrap below — just no decorative output.
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
