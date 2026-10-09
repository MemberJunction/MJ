/**
 * Built-in plugins shipped with DBAutoDoc.
 *
 * Each built-in is imported here so its `@RegisterClass` registration runs whenever the plugin
 * system is used, and listed with its default enabled state. Users can still turn a built-in
 * off with `{ "Name": "<Name>", "Enabled": false }` in the config's `plugins` array.
 */

import { INDEX_ADVISOR_PLUGIN_NAME } from './index-advisor/IndexAdvisorPlugin.js';

export interface BuiltInAutoDocPlugin {
  Name: string;
  EnabledByDefault: boolean;
}

export const BUILT_IN_PLUGINS: BuiltInAutoDocPlugin[] = [
  { Name: INDEX_ADVISOR_PLUGIN_NAME, EnabledByDefault: true }
];
