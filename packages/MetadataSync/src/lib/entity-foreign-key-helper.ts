import { Metadata, EntityDependency } from '@memberjunction/core';

/**
 * Information about a reverse foreign key relationship
 * (which entities reference a given entity)
 */
export interface ReverseFKInfo {
    entityName: string;         // Entity that has the FK
    fieldName: string;          // FK field name in that entity
    relatedFieldName: string;   // Field in target entity (usually 'ID')
}

/**
 * Helper utility for working with entity foreign key relationships
 * Provides methods for building reverse FK maps and querying dependencies
 */
export class EntityForeignKeyHelper {
    /**
     * Build a reverse foreign key map
     * Maps: entity name -> list of {entity, field} pairs that reference it
     *
     * Example: "Users" -> [{ entityName: "Orders", fieldName: "UserID", relatedFieldName: "ID" }]
     *
     * @param metadata The metadata instance
     * @returns Map of entity name to list of reverse FK references
     */
    static buildReverseFKMap(metadata: Metadata): Map<string, ReverseFKInfo[]> {
        const reverseMap = new Map<string, ReverseFKInfo[]>();

        for (const entity of metadata.Entities) {
            // Skip deprecated and disabled entities to avoid deprecation warnings during database scans
            if (entity.Status === 'Deprecated' || entity.Status === 'Disabled') {
                continue;
            }

            // Get all foreign key fields in this entity
            const foreignKeys = entity.ForeignKeys;

            for (const field of foreignKeys) {
                const targetEntity = field.RelatedEntity;

                if (!targetEntity) {
                    continue; // Skip if no related entity
                }

                // Add this FK to the reverse map for the target entity
                if (!reverseMap.has(targetEntity)) {
                    reverseMap.set(targetEntity, []);
                }

                reverseMap.get(targetEntity)!.push({
                    entityName: entity.Name,
                    fieldName: field.Name,
                    relatedFieldName: field.RelatedEntityFieldName || 'ID'
                });
            }
        }

        return reverseMap;
    }

    /**
     * Get entity dependencies using the Metadata API
     * Returns all entities that have foreign keys pointing to the specified entity
     *
     * @param metadata The metadata instance
     * @param entityName The entity to check dependencies for
     * @returns Array of entity dependencies
     */
    static async getEntityDependencies(
        metadata: Metadata,
        entityName: string
    ): Promise<EntityDependency[]> {
        return await metadata.GetEntityDependencies(entityName);
    }

    /**
     * Check if an entity has any dependent entities
     *
     * @param metadata The metadata instance
     * @param entityName The entity to check
     * @returns True if other entities reference this entity
     */
    static async hasDependentEntities(
        metadata: Metadata,
        entityName: string
    ): Promise<boolean> {
        const deps = await metadata.GetEntityDependencies(entityName);
        return deps.length > 0;
    }

    /**
     * Get all foreign key fields for an entity
     *
     * @param metadata The metadata instance
     * @param entityName The entity name
     * @returns Array of foreign key field names
     */
    static getForeignKeyFields(metadata: Metadata, entityName: string): string[] {
        const entity = metadata.Entities.find(e => e.Name === entityName);
        if (!entity) {
            return [];
        }

        return entity.ForeignKeys.map(fk => fk.Name);
    }
}
