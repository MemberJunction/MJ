/**
 * Plugin system exports. External plugins import BaseAutoDocPlugin and the types from here.
 */

export * from './types.js';
export { BaseAutoDocPlugin } from './BaseAutoDocPlugin.js';
export { PluginManager, LoadedAutoDocPlugin, AutoDocPluginRunContext } from './PluginManager.js';
export { BUILT_IN_PLUGINS, BuiltInAutoDocPlugin } from './builtins.js';
export * from './index-advisor/IndexAdvisorTypes.js';
export { IndexAdvisorPlugin, INDEX_ADVISOR_PLUGIN_NAME, DEFAULT_INDEX_ADVISOR_OPTIONS, GetIndexAdvisorData, ResolveIndexAdvisorOptions } from './index-advisor/IndexAdvisorPlugin.js';
export { ProposeIndexes, FindRedundantIndexes, IsCovered } from './index-advisor/IndexRules.js';
export { IndexMigrationGenerator } from './index-advisor/IndexMigrationGenerator.js';
export { IndexLLMReviewer, SelectReviewTables, BuildReviewContext, ApplyReviewResponse, IndexReviewTarget, IndexReviewApplyResult } from './index-advisor/IndexLLMReview.js';
