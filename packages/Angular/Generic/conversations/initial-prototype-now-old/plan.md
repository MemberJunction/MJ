# MemberJunction v3 Conversations Migration Plan

## Executive Summary

This document outlines the migration strategy for upgrading MemberJunction's conversation system from v2 to v3. The primary goal is to decouple artifacts from conversations, introduce a hierarchical organization structure with Environments, and implement a granular permission system that supports public sharing.

## Key Changes

### Architectural Improvements
1. **Decoupled Artifacts**: Artifacts become independent entities that can be linked to multiple locations
2. **Environment Containers**: Introduction of Environments as top-level organizational containers
3. **Flexible Linking**: Artifacts can exist in conversations, collections, and projects simultaneously
4. **Granular Permissions**: ACL-style permission system replacing simple SharingScope
5. **Public Sharing**: Support for external sharing via secure tokens

### Entities to Deprecate
- `ConversationArtifact` - Replaced by independent `Artifact` entity
- `ConversationArtifactVersion` - Replaced by `ArtifactVersion`
- These entities will be marked as 'Deprecated' in the Entity.Status column but retained for backward compatibility

### New Entities

#### Core Organization
- `Environment` - Top-level container (not surfaced in UI initially)
- `Project` - Container for grouping related conversations
- `Collection` - Folder structure for organizing artifacts (renamed from "Library" to avoid conflict)

#### Artifact System
- `Artifact` - Independent content items
- `ArtifactVersion` - Version history for artifacts
- `ArtifactLink` - Join table for multi-location artifacts
- `ConversationArtifactReference` - Tracks artifact appearances in conversations

#### Task Management
- `Task` - Top-level task entity for any work item (not tied to conversations)
- `TaskLink` - Links tasks flexibly to conversations, projects, or other entities
- `TaskArtifact` - Tracks artifact inputs/outputs with clear Direction field
- `TaskDependency` - Defines task relationships for workflow orchestration
- `ConversationParticipant` - Tracks active users and agents in conversations
- `AgentCapability` - Defines what each AI agent can do

#### Permission System
- `Permission` - Unified ACL-style permissions
- `PublicLink` - Shareable external links with optional password protection (stores hash only)

### Updated Entities
- `Conversation` - Adds EnvironmentID, ProjectID, IsPinned, LastActivityAt
- `Dashboard` - Adds EnvironmentID for consistency
- `Report` - Adds EnvironmentID (may eventually merge into Artifacts)

## Migration Phases

### Phase 1: Foundation (Week 1-2)
**Goal**: Establish new structure without breaking existing functionality

1. **Create Default Environment**
   ```sql
   DECLARE @DefaultEnvironmentID UNIQUEIDENTIFIER = '00000000-0000-0000-0000-000000000001';
   INSERT INTO Environment (ID, Name, Description, IsDefault)
   VALUES (@DefaultEnvironmentID, 'Default', 'Default environment for all users', 1);
   ```

2. **Deploy New Tables**
   - Run schema.sql to create all new tables
   - MemberJunction CodeGen will automatically detect and generate entities

3. **Update Existing Tables**
   - Add new columns to Conversation, Dashboard, Report
   - Set all existing records to use Default Environment

### Phase 2: Data Migration (Week 3-4)
**Goal**: Migrate existing data to new structure

1. **Migrate Artifacts**
   ```sql
   -- Copy ConversationArtifacts to new Artifact table
   INSERT INTO Artifact (ID, EnvironmentID, Name, Description, Type, Content, CreatedByUserID)
   SELECT 
       CA.ID,
       @DefaultEnvironmentID,
       CA.Name,
       CA.Description,
       AT.Name as Type,
       -- Content migration handled separately
       CA.CreatedByUserID
   FROM ConversationArtifact CA
   INNER JOIN ArtifactType AT ON CA.ArtifactTypeID = AT.ID;
   ```

2. **Create Artifact Links**
   ```sql
   -- Link artifacts back to their original conversations
   INSERT INTO ArtifactLink (ArtifactID, LinkedEntityType, LinkedEntityID, LinkType)
   SELECT ID, 'Conversation', ConversationID, 'created'
   FROM ConversationArtifact;
   ```

3. **Migrate Versions**
   ```sql
   -- Copy version history
   INSERT INTO ArtifactVersion (ArtifactID, VersionNumber, Content, CreatedByUserID)
   SELECT 
       ConversationArtifactID,
       VersionNumber,
       Content,
       CreatedByUserID
   FROM ConversationArtifactVersion;
   ```

4. **Migrate Permissions**
   - Convert SharingScope values to new Permission records
   - Map 'Everyone' → GranteeType='Everyone'
   - Map 'SpecificUsers' → Individual Permission records
   - Map 'Public' → PublicLink record

### Phase 3: API Updates (Week 5-6)
**Goal**: Update GraphQL schema and resolvers

1. **Update GraphQL Schema**
   - Add new types for Environment, Artifact, Library, Project
   - Update Conversation type with new fields
   - Add new queries and mutations

2. **Update Resolvers**
   - Implement CRUD operations for new entities
   - Update conversation resolvers to handle environments
   - Implement artifact linking logic

3. **Backward Compatibility Layer**
   - Create views that mimic old ConversationArtifact structure
   - Update existing queries to work with new structure
   - Ensure no breaking changes for existing clients

### Phase 4: UI Implementation (Week 7-10)
**Goal**: Implement new UI based on prototype

1. **Collections Tab**
   - Implement folder hierarchy navigation
   - Drag-and-drop artifact organization
   - Search and filter capabilities

2. **Artifact Management**
   - Inline artifact display in conversations
   - Save to collection functionality
   - Version history viewer
   - Sharing modal with permissions

3. **Project Organization**
   - Project badges on conversations
   - Project-based filtering
   - Project management UI

4. **Public Sharing**
   - Generate shareable links
   - Password protection options
   - Expiration settings
   - View count tracking

### Phase 5: Testing & Validation (Week 11-12)
**Goal**: Ensure system stability and data integrity

1. **Data Validation**
   - Verify all artifacts migrated correctly
   - Check permission mappings
   - Validate foreign key relationships

2. **Performance Testing**
   - Test query performance with new join patterns
   - Optimize indexes as needed
   - Load test artifact linking

3. **User Acceptance Testing**
   - Test all CRUD operations
   - Verify permission enforcement
   - Test public sharing scenarios

### Phase 6: Deployment (Week 13)
**Goal**: Roll out to production

1. **Pre-Deployment**
   - Final data backup
   - Deprecation notices for old entities
   - Update documentation

2. **Deployment**
   - Run migrations in production
   - Monitor for issues
   - Keep rollback plan ready

3. **Post-Deployment**
   - Monitor performance metrics
   - Gather user feedback
   - Address any critical issues

## Technical Considerations

### Performance Optimizations
- Comprehensive indexing strategy (see schema.sql)
- Consider materialized views for complex queries
- Implement caching for permission checks

### Security Considerations
- Public links use secure random tokens
- Optional password protection for shared content
- Expiration dates and view limits for public links
- Audit logging for all permission changes

### Backward Compatibility
- Old entities marked as deprecated, not deleted
- Views created to maintain existing API contracts
- Gradual migration path for clients

## Rollback Strategy

If issues arise during migration:

1. **Database Rollback**
   ```sql
   -- Remove foreign key constraints
   ALTER TABLE Conversation DROP CONSTRAINT FK_Conversation_Environment;
   ALTER TABLE Conversation DROP CONSTRAINT FK_Conversation_Project;
   
   -- Remove new columns
   ALTER TABLE Conversation DROP COLUMN EnvironmentID, ProjectID, IsPinned, LastActivityAt;
   
   -- Drop new tables (in reverse dependency order)
   DROP TABLE PublicLink;
   DROP TABLE Permission;
   -- etc.
   ```

2. **Application Rollback**
   - Revert to previous API version
   - Restore old UI components
   - Re-enable deprecated entity usage

## Success Metrics

- **Zero Data Loss**: All existing artifacts and conversations preserved
- **No Breaking Changes**: Existing integrations continue to work
- **Performance**: Query response times remain under 100ms
- **Adoption**: 50% of users utilizing new collection feature within 30 days
- **Stability**: Less than 0.1% error rate post-deployment

## Timeline Summary

- **Weeks 1-2**: Foundation - Create new structure
- **Weeks 3-4**: Migration - Move existing data
- **Weeks 5-6**: API - Update backend services
- **Weeks 7-10**: UI - Implement new interface
- **Weeks 11-12**: Testing - Validate everything
- **Week 13**: Deployment - Go live

## Next Steps

1. Review and approve this plan
2. Set up development environment for v3
3. Begin Phase 1 implementation
4. Schedule regular progress reviews
5. Prepare communication plan for users

## Appendix

### Default Environment GUID
We will use a consistent GUID across all environments:
```
00000000-0000-0000-0000-000000000001
```

### Entity Status Codes
For deprecation in __mj.Entity table:
- 'Active' - Normal operation
- 'Deprecated' - Marked for future removal
- 'Deleted' - Soft deleted (not used here)

### Migration Scripts Location
All migration scripts will be stored in:
- `/migrations/v3.x/` - Flyway migration files
- `/v3_conversations/` - Reference schemas and plans