-- PR #2209 Part 3.6: MCP Tool Favorites
-- Creates per-user star/favorite tracking for MCP Server Tools, enabling the
-- "Favorites only" quick filter in the MCP Dashboard and pinning frequently
-- used tools to the top of the searchable test dialog combobox.

CREATE TABLE ${flyway:defaultSchema}.MCPToolFavorite (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    UserID UNIQUEIDENTIFIER NOT NULL,
    MCPServerToolID UNIQUEIDENTIFIER NOT NULL,
    CONSTRAINT PK_MCPToolFavorite PRIMARY KEY (ID),
    CONSTRAINT FK_MCPToolFavorite_User
        FOREIGN KEY (UserID) REFERENCES ${flyway:defaultSchema}.[User](ID),
    CONSTRAINT FK_MCPToolFavorite_MCPServerTool
        FOREIGN KEY (MCPServerToolID) REFERENCES ${flyway:defaultSchema}.MCPServerTool(ID),
    CONSTRAINT UQ_MCPToolFavorite_User_Tool UNIQUE (UserID, MCPServerToolID)
);
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Per-user favorite marker for an MCP Server Tool. Lets users star tools for quick access in the MCP Dashboard and Test dialog.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'MCPToolFavorite';
GO
