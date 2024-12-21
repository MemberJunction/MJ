import { Hook } from '@oclif/core';
import figlet from 'figlet';

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
};

export default hook;
