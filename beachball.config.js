const { readyFileSync } = require('node:fs');
const { execSync, exec } = require('node:child_process');

/**
 * See https://microsoft.github.io/beachball/overview/configuration.html#options
 *
 * @type {import('beachball').BeachballConfig}
 */
module.exports = {
  generateChangelog: process.env.BRANCH === 'main',
  bumpDeps: true,
  gitTags: false,
  message: 'Applying package updates [skip ci]',
  groups: [
    {
      name: 'MJ',
      include: ['packages/*', 'packages/AI/*', 'packages/Angular/*', 'packages/AngularElements/*'],
    },
  ],
  precommit: (cwd) => {
    const { version } = readFileSync(`${cwd}/packages/MJGlobal/package.json`, 'utf8').toString();
    execSync(`git tag -v${version}`, { cwd });
  },
};
