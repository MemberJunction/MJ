/**
 * Utility functions for working with Skip types.
 *
 * NOTE: Entity metadata conversion functions (MapEntityInfoToSkipEntityInfo, etc.)
 * have been removed. Entity metadata is now passed directly as EntityInfo objects
 * from @memberjunction/core — no intermediate Skip-specific entity types are needed.
 * Use EntityInfo.toJSON() for serialization and new EntityInfo(data) for deserialization.
 */
