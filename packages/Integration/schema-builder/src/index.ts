// Interfaces
export type {
    DatabasePlatform,
    SourceSchemaInfo,
    SourceObjectInfo,
    SourceFieldInfo,
    SourceRelationshipInfo,
    TargetTableConfig,
    TargetColumnConfig,
    SoftFKEntry,
    ExistingTableInfo,
    ExistingColumnInfo,
    SchemaDiff,
    ColumnModification,
    TypeMappingEntry,
    EmittedFile,
    MigrationMetadata,
    SchemaBuilderInput,
    SchemaBuilderOutput,
    AccessControlResult,
} from './interfaces.js';

// Re-export RSU types for consumers of RunSchemaPipeline()
export type { RSUPipelineInput, RSUPipelineResult, RSUPipelineStep } from '@memberjunction/schema-engine';

// Classes
export { TypeMapper } from './TypeMapper.js';
export { DDLGenerator, ValidateIdentifier } from './DDLGenerator.js';
export { MigrationFileWriter } from './MigrationFileWriter.js';
export { SoftFKConfigEmitter } from './SoftFKConfigEmitter.js';
export { MetadataEmitter } from './MetadataEmitter.js';
export { SchemaEvolution } from './SchemaEvolution.js';
export { SchemaBuilder } from './SchemaBuilder.js';

// Functions
export { IsEntityBlocked, IsIntegrationWriteAllowed, GetBlockedEntities } from './AccessControl.js';
