/*
 * Migration: Add Agent Administrator Role
 * Description: Creates a new "Agent Administrator" role with full CRUD permissions on all entities used by AgentSpecSync
 * Version: v2.111.x
 * Date: 2025-10-25
 *
 * This role is required for the AgentSpecSync system to properly manage AI agents, their prompts, actions,
 * relationships, steps, and paths without relying on system-level permissions.
 */

-- =============================================
-- PART 1: Create Agent Administrator Role
-- =============================================

DECLARE @AgentAdminRoleID UNIQUEIDENTIFIER = 'EAB32881-8A52-4787-BCAC-033B7CC53963';

-- Insert the new Agent Administrator role
INSERT INTO ${flyway:defaultSchema}.Role (ID, Name, Description)
VALUES (
    @AgentAdminRoleID,
    'Agent Administrator',
    'Role with full permissions to manage AI agents, prompts, actions, relationships, steps, and paths. Required for AgentSpecSync operations.'
);

-- =============================================
-- PART 2: Grant Full Permissions on AgentSpecSync Entities
-- =============================================

-- Grant permissions on AI Agents
INSERT INTO ${flyway:defaultSchema}.EntityPermission (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete)
VALUES (
    (SELECT ID FROM ${flyway:defaultSchema}.Entity WHERE Name = 'AI Agents'),
    @AgentAdminRoleID,
    1, 1, 1, 1
);

-- Grant permissions on AI Agent Actions
INSERT INTO ${flyway:defaultSchema}.EntityPermission (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete)
VALUES (
    (SELECT ID FROM ${flyway:defaultSchema}.Entity WHERE Name = 'AI Agent Actions'),
    @AgentAdminRoleID,
    1, 1, 1, 1
);

-- Grant permissions on MJ: AI Agent Prompts
INSERT INTO ${flyway:defaultSchema}.EntityPermission (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete)
VALUES (
    (SELECT ID FROM ${flyway:defaultSchema}.Entity WHERE Name = 'MJ: AI Agent Prompts'),
    @AgentAdminRoleID,
    1, 1, 1, 1
);

-- Grant permissions on MJ: AI Agent Relationships
INSERT INTO ${flyway:defaultSchema}.EntityPermission (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete)
VALUES (
    (SELECT ID FROM ${flyway:defaultSchema}.Entity WHERE Name = 'MJ: AI Agent Relationships'),
    @AgentAdminRoleID,
    1, 1, 1, 1
);

-- Grant permissions on MJ: AI Agent Steps
INSERT INTO ${flyway:defaultSchema}.EntityPermission (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete)
VALUES (
    (SELECT ID FROM ${flyway:defaultSchema}.Entity WHERE Name = 'MJ: AI Agent Steps'),
    @AgentAdminRoleID,
    1, 1, 1, 1
);

-- Grant permissions on MJ: AI Agent Step Paths
INSERT INTO ${flyway:defaultSchema}.EntityPermission (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete)
VALUES (
    (SELECT ID FROM ${flyway:defaultSchema}.Entity WHERE Name = 'MJ: AI Agent Step Paths'),
    @AgentAdminRoleID,
    1, 1, 1, 1
);

-- Grant permissions on AI Prompts
INSERT INTO ${flyway:defaultSchema}.EntityPermission (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete)
VALUES (
    (SELECT ID FROM ${flyway:defaultSchema}.Entity WHERE Name = 'AI Prompts'),
    @AgentAdminRoleID,
    1, 1, 1, 1
);

-- =============================================
-- PART 3: Extended Properties for Documentation
-- =============================================

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Role with full permissions to manage AI agents and all related entities. This role is required for AgentSpecSync operations to function correctly, allowing create, read, update, and delete operations on agents, prompts, actions, relationships, steps, and paths.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'Role',
    @level2type = N'COLUMN', @level2name = 'Name';
