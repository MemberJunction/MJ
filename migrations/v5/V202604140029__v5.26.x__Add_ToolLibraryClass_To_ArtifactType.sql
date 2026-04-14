-- Add ToolLibraryClass column to ArtifactType entity.
-- Enables plugin-based artifact tool resolution: each artifact type can register
-- a BaseArtifactToolLibrary subclass that provides type-specific exploration tools
-- for agents. When set, ArtifactToolManager resolves the library via ClassFactory.
-- When NULL, falls back to name-based heuristic resolution.

ALTER TABLE ${flyway:defaultSchema}.ArtifactType
    ADD ToolLibraryClass NVARCHAR(100) NULL;

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Class name for the BaseArtifactToolLibrary subclass that provides type-specific artifact exploration tools for agents. Resolved via ClassFactory. When NULL, ArtifactToolManager uses name-based fallback resolution.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ArtifactType',
    @level2type = N'COLUMN', @level2name = N'ToolLibraryClass';

-- Seed known tool library classes for core artifact types
UPDATE ${flyway:defaultSchema}.ArtifactType
    SET ToolLibraryClass = 'DataSnapshotToolLibrary'
    WHERE Name = 'Data Snapshot';

UPDATE ${flyway:defaultSchema}.ArtifactType
    SET ToolLibraryClass = 'JSONToolLibrary'
    WHERE Name = 'JSON';

UPDATE ${flyway:defaultSchema}.ArtifactType
    SET ToolLibraryClass = 'TextToolLibrary'
    WHERE Name IN ('Text', 'Code', 'Markdown');

UPDATE ${flyway:defaultSchema}.ArtifactType
    SET ToolLibraryClass = 'PDFToolLibrary'
    WHERE Name = 'PDF';

UPDATE ${flyway:defaultSchema}.ArtifactType
    SET ToolLibraryClass = 'ExcelToolLibrary'
    WHERE Name IN ('Excel', 'Spreadsheet');

UPDATE ${flyway:defaultSchema}.ArtifactType
    SET ToolLibraryClass = 'DocxToolLibrary'
    WHERE Name IN ('Word', 'Document');
