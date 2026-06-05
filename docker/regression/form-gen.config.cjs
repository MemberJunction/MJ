/**
 * Form-generator config — extends docker/MJAPI/docker.config.cjs with the
 * full set of `output` directives that a normal MJExplorer codegen run uses.
 *
 * The base config (used by MJAPI in production) intentionally trims `output`
 * down to just GraphQLServer + ActionSubclasses + EntitySubclasses because
 * the production API never generates Angular forms — those are baked into
 * MJExplorer at build time. In the regression docker stack, however, we
 * need to generate forms at runtime against the AssociationDemo schema,
 * so this config supplies the full output array from the repo-root
 * mj.config.cjs (the one a developer runs `mj codegen` with locally).
 *
 * This file is bind-mounted over /app/mj.config.cjs inside the
 * form-generator container; everything else (DB credentials, settings, etc.)
 * comes from the base docker config via the spread.
 */
// NOTE: this require path is relative to where this file lives INSIDE the
// container after bind-mounting (/app/mj.config.cjs). The compose service
// mounts ../MJAPI/docker.config.cjs (host) at /app/docker/MJAPI/docker.config.cjs
// (container) so this require resolves correctly at runtime — it does NOT
// resolve correctly from the host filesystem.
const baseConfig = require('./docker/MJAPI/docker.config.cjs');

module.exports = {
  ...baseConfig,
  output: [
    { type: 'SQL', directory: './SQL Scripts/generated', appendOutputCode: true },
    {
      type: 'Angular',
      directory: './packages/MJExplorer/src/app/generated',
      options: [{ name: 'maxComponentsPerModule', value: 20 }],
    },
    {
      type: 'AngularCoreEntities',
      directory: './packages/Angular/Explorer/core-entity-forms/src/lib/generated',
      options: [{ name: 'maxComponentsPerModule', value: 100 }],
    },
    { type: 'GraphQLServer', directory: './packages/MJAPI/src/generated' },
    { type: 'GraphQLCoreEntityResolvers', directory: './packages/MJServer/src/generated' },
    { type: 'CoreActionSubclasses', directory: './packages/Actions/CoreActions/src/generated' },
    { type: 'ActionSubclasses', directory: './packages/GeneratedActions/src/generated' },
    { type: 'CoreEntitySubclasses', directory: './packages/MJCoreEntities/src/generated' },
    { type: 'EntitySubclasses', directory: './packages/GeneratedEntities/src/generated' },
    { type: 'DBSchemaJSON', directory: './Schema Files' },
  ],
};
