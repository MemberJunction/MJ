/**
 * @fileoverview Public API surface of `@memberjunction/tours-runtime`.
 * Pure TypeScript (L0) — zero Angular, zero DOM, zero entity dependencies.
 * Zero re-exports between packages (`AGENTS.md` Rule #5).
 * @module @memberjunction/tours-runtime
 */

import { RegisterStandardTourPlugins } from './plugins/register-standard-plugins';

// Ensure all standard ClassFactory plugins are registered upon module import
RegisterStandardTourPlugins();

// Core Types & Localization
export * from './types';
export * from './host-contracts';
export * from './localization';

// Events & Signals
export * from './events';
export * from './signals';

// Pathway Compiler & Stores
export * from './tour-graph-compiler';
export * from './stores';

// Session & Agent Toolkit
export * from './tour-session';
export * from './agent-toolkit';

// Plugin Base Classes & Standard Library
export * from './plugins/plugin-types';
export * from './plugins/base-driver';
export * from './plugins/base-step-type';
export * from './plugins/standard-step-types';
export * from './plugins/base-anchor-resolver';
export * from './plugins/standard-anchor-resolvers';
export * from './plugins/base-completion-check';
export * from './plugins/standard-completion-checks';
export * from './plugins/base-trigger';
export * from './plugins/standard-triggers';
export * from './plugins/base-eligibility-policy';
export * from './plugins/standard-eligibility-policies';
export * from './plugins/base-director';
export * from './plugins/standard-directors';
export * from './plugins/register-standard-plugins';
