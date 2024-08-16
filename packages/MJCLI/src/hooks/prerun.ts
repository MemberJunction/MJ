import { Hook } from '@oclif/core';

const hook: Hook<'prerun'> = async function (options) {
  if (options.Command.id !== 'version') {
    options.context.log(options.config.userAgent + '\n');
  }
};

export default hook;
