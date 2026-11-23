// Importing this module registers the Google Cloud Pub/Sub transport with the engine:
//  - @RegisterClass(BaseTransportDriverFactory, 'GCP') runs when GcpTransportDriverFactory is evaluated;
//  - the manifest enricher is registered below.
// It imports only the engine modules it needs — never '../index' or '../WorkQueueEngine' — so loading it cannot
// create an import cycle with the main entry.
import { ManifestEnricherRegistry } from '../topology/ManifestEnricherRegistry';
import { EnrichGcpManifest, GCP_DRIVER_CLASS } from './GcpManifestEnricher';

export * from './ResolveGcpCredentials';
export * from './GcpTransportDriverFactory';
export * from './GcpManifestEnricher';
export * from './GcpPublishCoordinator';

ManifestEnricherRegistry.Instance.Register(GCP_DRIVER_CLASS, EnrichGcpManifest);
