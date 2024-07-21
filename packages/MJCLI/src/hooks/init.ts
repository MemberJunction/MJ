import { Hook } from '@oclif/core';
import figlet from 'figlet';

const hook: Hook<'init'> = async function (options) {
  console.log(
    figlet.textSync('MemberJunction', {
      font: 'Standard',
      horizontalLayout: 'default',
      verticalLayout: 'default',
      width: 100,
      whitespaceBreak: true,
    })
  );
};

export default hook;
