import { Hook } from '@oclif/core';

/**
 * Init hook runs once when the CLI starts up.
 * Currently unused but required by oclif configuration.
 */
const hook: Hook<'init'> = async function () {
  // No initialization needed at this time
};

export default hook;