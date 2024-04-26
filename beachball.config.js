/**
 * See https://microsoft.github.io/beachball/overview/configuration.html#options
 *
 * @type {import('beachball').BeachballConfig}
 */
module.exports = {
  generateChangelog: process.env.BRANCH === 'main',
  bumpDeps: true,
  gitTags: false,
  groups: [
    {
      name: 'MJ',
      include: ['packages/*', 'packages/AI/*', 'packages/Angular/*', 'packages/AngularElements/*'],
    },
  ],
};
