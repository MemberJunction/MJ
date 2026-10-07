// Importing this module registers the AWS transport with the engine (03 §0, F12):
//  - @RegisterClass(BaseTransportDriverFactory, 'AWS') runs when AWSTransportDriverFactory is evaluated;
//  - the manifest enricher is registered below.
// It imports only the engine modules it needs — never '../index' or '../WorkQueueEngine' — so loading it cannot
// create an import cycle with the main entry.
import { ManifestEnricherRegistry } from '../topology/ManifestEnricherRegistry';
import { AWS_DRIVER_CLASS, EnrichAwsManifest } from './AwsManifestEnricher';

export * from './ResolveAwsCredentials';
export * from './AWSTransportDriverFactory';
export * from './AwsManifestEnricher';

ManifestEnricherRegistry.Instance.Register(AWS_DRIVER_CLASS, EnrichAwsManifest);
