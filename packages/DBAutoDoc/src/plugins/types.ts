/**
 * Plugin system types for DBAutoDoc.
 *
 * Plugins are classes registered with `@RegisterClass(BaseAutoDocPlugin, '<Name>')` and
 * enabled through the `plugins` section of the config file. They can run at fixed points
 * of the analysis pipeline and contribute export formats.
 */

import type { DBAutoDocConfig } from '../types/config.js';
import type { DatabaseDocumentation } from '../types/state.js';
import type { BaseAutoDocDriver } from '../drivers/BaseAutoDocDriver.js';

/** Points in the analysis pipeline where plugins can run, in execution order. */
export type AutoDocPluginHook =
  | 'PreRun'
  | 'AfterIntrospection'
  | 'AfterDiscovery'
  | 'AfterDescriptions'
  | 'AfterPruning'
  | 'PostRun';

/** JSON-compatible value, used for plugin options read from the config file. */
export type AutoDocPluginJSONValue =
  | string
  | number
  | boolean
  | null
  | AutoDocPluginJSONValue[]
  | { [key: string]: AutoDocPluginJSONValue };

/** One entry in the config file's `plugins` array. */
export interface AutoDocPluginConfigEntry {
  /** Registration key the plugin class was registered under (`@RegisterClass(BaseAutoDocPlugin, Name)`). */
  Name: string;
  /**
   * Module to load before looking the plugin up: an npm package name or a file path
   * (relative paths resolve from the current working directory). Omit for built-in plugins.
   */
  Module?: string;
  /** Defaults to true. Set false to turn a plugin (including a built-in one) off. */
  Enabled?: boolean;
  /** Lower runs first. Defaults to 100. */
  Priority?: number;
  /** Plugin-specific options, passed to the plugin unchanged. */
  Options?: { [key: string]: AutoDocPluginJSONValue };
}

/** Everything a plugin hook receives. */
export interface AutoDocPluginContext {
  Hook: AutoDocPluginHook;
  State: DatabaseDocumentation;
  Config: DBAutoDocConfig;
  /** The open database connection. Present for every hook except PreRun. */
  Driver?: BaseAutoDocDriver;
  /** This plugin's options from the config file (empty object when none). */
  Options: { [key: string]: AutoDocPluginJSONValue };
  /** Folder the current run writes its outputs to. */
  RunFolder: string;
  Log: (message: string) => void;
}

/** Record of one hook execution, persisted in the state file. */
export interface AutoDocPluginHookRun {
  Hook: AutoDocPluginHook;
  StartedAt: string;
  CompletedAt: string;
  Success: boolean;
  ErrorMessage?: string;
}

/** A plugin's section of the state file (`state.plugins[<Name>]`). */
export interface AutoDocPluginStateSection {
  Runs: AutoDocPluginHookRun[];
  /** Data the plugin chose to persist. Its shape is defined by the plugin. */
  Data?: object;
}

/** One file produced by an exporter. */
export interface AutoDocExportFile {
  /** File name relative to the export output directory. */
  FileName: string;
  Content: string;
}

/** Options every exporter receives from the export command. */
export interface AutoDocExporterOptions {
  Provider: 'sqlserver' | 'mysql' | 'postgresql';
  /** Set when the user passed a prefix override (e.g. for migration file names). */
  FileNamePrefix?: string;
}

/** An export format contributed by a plugin, selected with `export --format <Format>`. */
export interface AutoDocExporter {
  Format: string;
  Description: string;
  Generate(state: DatabaseDocumentation, options: AutoDocExporterOptions): AutoDocExportFile[];
}
