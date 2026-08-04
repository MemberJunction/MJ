// PUBLIC API SURFACE AREA.
// Provider contract (types + BaseSignatureProvider) plus the metadata-cache engine
// (SignatureEngineBase). These depend only on @memberjunction/core + core-entities, both of which
// are client-safe, so this entry stays importable from the browser. SignatureEngineBase mirrors
// FileStorageEngineBase: a BaseEngine that caches the Providers + Accounts metadata.
//
// The credential-decrypting, DB-writing server engine (SignatureEngine) and its driver-init helper
// are intentionally NOT exported here — import them from '@memberjunction/esignature/server' so
// client bundles stay free of the server-only @memberjunction/credentials dependency.
export * from './types';
export * from './BaseSignatureProvider';
export * from './SignatureEngineBase';
