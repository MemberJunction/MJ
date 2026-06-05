// PUBLIC API SURFACE AREA — pure contract, no MemberJunction data dependencies.
// The server engine is intentionally NOT exported here; import it from
// '@memberjunction/esignature/server' so client bundles stay free of server-only deps.
export * from './types';
export * from './BaseSignatureProvider';
