/**
 * MetadataEmitter — produces /metadata/ JSON files for mj-sync.
 * Generates EntitySettings (e.g., IntegrationWriteAllowed) and mj-sync config.
 */
import type { EmittedFile } from './interfaces.js';

/**
 * Produces metadata JSON files for the mj-sync push pipeline.
 */
export class MetadataEmitter {
    /**
     * Generate a single EntitySettings JSON object for an entity.
     */
    GenerateEntitySettingsRecord(entityName: string, settings: Record<string, string>): Record<string, unknown> {
        const settingsRecords = Object.entries(settings).map(([name, value]) => ({
            fields: {
                Name: name,
                Value: value,
                Comments: `Managed by Integration Schema Builder`,
            },
        }));

        return {
            fields: { Name: entityName },
            relatedEntities: {
                'MJ: Entity Settings': settingsRecords,
            },
            primaryKey: {
                ID: `@lookup:MJ: Entities.Name=${entityName}`,
            },
        };
    }

    /**
     * Emit the IntegrationWriteAllowed EntitySettings file for a set of entities.
     */
    EmitEntitySettingsFile(entityNames: string[], metadataDir: string): EmittedFile {
        const records = entityNames.map(name =>
            this.GenerateEntitySettingsRecord(name, { IntegrationWriteAllowed: 'true' })
        );

        return {
            FilePath: `${metadataDir}/entity-settings/.integration-write-allowed.json`,
            Content: JSON.stringify(records, null, 2) + '\n',
            Description: `EntitySettings: IntegrationWriteAllowed=true for ${entityNames.join(', ')}`,
        };
    }

    /**
     * Emit the .mj-sync.json config for the entity-settings directory.
     */
    EmitMjSyncConfig(metadataDir: string): EmittedFile {
        const config = {
            entity: 'MJ: Entities',
            filePattern: '**/.*.json',
        };

        return {
            FilePath: `${metadataDir}/entity-settings/.mj-sync.json`,
            Content: JSON.stringify(config, null, 2) + '\n',
            Description: 'mj-sync configuration for entity-settings directory',
        };
    }
}
