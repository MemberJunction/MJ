import { Hook } from '@oclif/core';
import figlet from 'figlet';
import { LIGHT_COMMANDS } from '../light-commands.js';

const hook: Hook<'prerun'> = async function (options) {
  // Skip banners if --quiet flag is present (or appears to be present)
  if (options.argv?.some((arg) => arg === '--quiet' || (/^-[^-]+/.test(arg) && arg.includes('q')))) {
    return;
  }

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

  if (options.Command.id !== 'version') {
    options.context.log(options.config.userAgent + '\n');
  }

  // Conditionally load MJ bootstrap for heavy commands.
  // Light commands (version, help, bump, migrate, clean, install, dbdoc/*)
  // skip the ~1,400 class registrations for instant startup.
  const commandId = options.Command.id ?? '';
  if (!LIGHT_COMMANDS.has(commandId)) {
    await import('@memberjunction/server-bootstrap-lite/mj-class-registrations');
  }
};

export default hook;
