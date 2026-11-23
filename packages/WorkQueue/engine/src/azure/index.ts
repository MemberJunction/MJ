// Importing this module registers the Azure Service Bus transport with the engine:
//  - @RegisterClass(BaseTransportDriverFactory, 'Azure') runs when AzureTransportDriverFactory is evaluated;
//  - the manifest enricher is registered below.
// It imports only the engine modules it needs — never '../index' or '../WorkQueueEngine' — so loading it cannot
// create an import cycle with the main entry.
import { ManifestEnricherRegistry } from '../topology/ManifestEnricherRegistry';
import { AZURE_DRIVER_CLASS, EnrichAzureManifest } from './AzureManifestEnricher';

export * from './ResolveAzureCredentials';
export * from './AzureTransportDriverFactory';
export * from './AzureManifestEnricher';

ManifestEnricherRegistry.Instance.Register(AZURE_DRIVER_CLASS, EnrichAzureManifest);
