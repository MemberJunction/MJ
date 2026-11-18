/**
 * @module snapshot
 *
 * Barrel for the Training Snapshot: the byte hash, the three files' serialization, parsing and
 * fingerprints, the assembly code-version stamp, the write-once file stores, the verified manifest read, the protocol's
 * holdout carvers, the builder, the snapshot and run reads, and training from a snapshot.
 */

export * from './snapshot-hash';
export * from './snapshot-serialization';
export * from './code-version';
export * from './snapshot-file-store';
export * from './snapshot-manifest';
export * from './holdout-carver';
export * from './snapshot-builder';
export * from './training-snapshot-store';
export * from './snapshot-retrainer';
