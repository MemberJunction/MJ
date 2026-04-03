-- Add ToolLibraryClass to ArtifactType for plugin-based artifact tool resolution.
-- When set, the ArtifactToolManager uses this class (registered via @RegisterClass)
-- to provide type-specific tools for agent artifact exploration.
-- Child types inherit the parent's ToolLibraryClass if not overridden.

ALTER TABLE ${flyway:defaultSchema}.ArtifactType
    ADD ToolLibraryClass NVARCHAR(255) NULL;

-- Seed known tool library classes for existing artifact types
UPDATE ${flyway:defaultSchema}.ArtifactType
    SET ToolLibraryClass = 'DataSnapshotToolLibrary'
    WHERE Name = 'Data' OR Name = 'Data Snapshot';

UPDATE ${flyway:defaultSchema}.ArtifactType
    SET ToolLibraryClass = 'JSONToolLibrary'
    WHERE Name = 'JSON';

UPDATE ${flyway:defaultSchema}.ArtifactType
    SET ToolLibraryClass = 'TextToolLibrary'
    WHERE Name IN ('Code', 'Markdown', 'Text', 'HTML', 'SVG');
