// SERVER-SIDE PUBLIC API — imported via '@memberjunction/esignature/server'.
// Adds credential decryption + envelope-lifecycle persistence on top of the metadata cache.
// Depends on the server-only @memberjunction/credentials package, which is why these live behind
// the '/server' subpath. SignatureEngineBase (metadata-only) is exported from the root entry,
// '@memberjunction/esignature', NOT here — re-export it there to keep one source of truth.
export * from './SignatureEngine';
export * from './util';
export * from './artifacts';
