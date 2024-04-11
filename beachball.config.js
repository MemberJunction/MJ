/**
 * See https://microsoft.github.io/beachball/overview/configuration.html#options
 *
 * @type {import('beachball').BeachballConfig}
 */
module.exports = {
  bumpDeps: true,
  groups: [
    {
      name: 'MJ',
      include: ['packages/*', 'packages/AI/*', 'packages/Angular/*', 'packages/AngularElements/*'],
    },
  ],
};
