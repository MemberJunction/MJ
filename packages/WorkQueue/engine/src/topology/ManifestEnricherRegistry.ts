import { BaseSingleton } from '@memberjunction/global';
import { WorkQueueConfigurationError, type TopologyManifest } from '@memberjunction/work-queue-core';

export type ManifestEnricher = (manifest: TopologyManifest) => TopologyManifest;

const DATABASE_DRIVER_CLASS = 'Database';

/**
 * Transport-specific manifest rendering. The main entry owns the registry; a transport's engine subpath
 * (`@memberjunction/work-queue-engine/aws`) registers its enricher as an import side effect, so the main entry never
 * imports a cloud package (03 §0, F12).
 */
export class ManifestEnricherRegistry extends BaseSingleton<ManifestEnricherRegistry> {
    private readonly enrichers = new Map<string, ManifestEnricher>();

    protected constructor() {
        super();
    }

    public static get Instance(): ManifestEnricherRegistry {
        return super.getInstance<ManifestEnricherRegistry>();
    }

    public Register(driverClass: string, enricher: ManifestEnricher): void {
        this.enrichers.set(driverClass, enricher);
    }

    public Has(driverClass: string): boolean {
        return this.enrichers.has(driverClass);
    }

    /** Database manifests pass through. A cloud manifest without its enricher is refused rather than exported half-rendered. */
    public Apply(manifest: TopologyManifest): TopologyManifest {
        const driverClass = manifest.Transport.DriverClass;
        const enricher = this.enrichers.get(driverClass);
        if (enricher) {
            return enricher(manifest);
        }
        if (driverClass === DATABASE_DRIVER_CLASS) {
            return manifest;
        }
        throw new WorkQueueConfigurationError(
            `No manifest enricher is registered for DriverClass '${driverClass}'. Import the transport's engine entry in this process ` +
            `(for AWS: import '@memberjunction/work-queue-engine/aws').`,
        );
    }
}
