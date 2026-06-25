/**
 * @fileoverview Public API for the Record Set Processor base package — client-safe types, the three
 * pluggable seams (source / processor / tracker), and the built-in source adapters.
 * @module @memberjunction/record-set-processor-base
 */

export * from './types';
export * from './interfaces';
export * from './sources';
// The RecordProcess.RunNow Remote Operation base + RecordProcessScopeOverride/RecordProcessRunNowInput/Output
// are now CodeGen-emitted into @memberjunction/core-entities (generated/remote_operations.ts) from the
// MJ: Remote Operations metadata row.
