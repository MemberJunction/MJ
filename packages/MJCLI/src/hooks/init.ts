import { Hook } from '@oclif/core';
import figlet from 'figlet';

const hook: Hook<'init'> = async function (options) {
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
};

export default hook;
