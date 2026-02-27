-- ============================================================================
-- MemberJunction v5.0 PostgreSQL Baseline
-- Deterministically converted from SQL Server using TypeScript conversion pipeline
-- ============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Schema
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;

-- Ensure backslashes in string literals are treated literally (not as escape sequences)
SET standard_conforming_strings = on;

-- Implicit INTEGER -> BOOLEAN cast (SQL Server BIT columns accept 0/1 in INSERTs)
-- PostgreSQL has a built-in explicit-only INTEGER->bool cast. We upgrade it to implicit
-- so INSERT VALUES with 0/1 for BOOLEAN columns work like SQL Server BIT.
UPDATE pg_cast SET castcontext = 'i'
WHERE castsource = 'integer'::regtype AND casttarget = 'boolean'::regtype;


-- ===================== DDL: Tables, PKs, Indexes =====================

CREATE TABLE #EntityNameMapping (
 "OldName" VARCHAR(255) NOT NULL,
 "NewName" VARCHAR(255) NOT NULL
);


-- ===================== Helper Functions (fn*) =====================


-- ===================== Views =====================


-- ===================== Stored Procedures (sp*) =====================


-- ===================== Triggers =====================


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

-- Insert all entity name mappings (old name -> new name with "MJ: " prefix)
INSERT INTO #"EntityNameMapping" ("OldName", "NewName") VALUES
('Action Authorizations', 'MJ: Action Authorizations'),
('Action Categories', 'MJ: Action Categories'),
('Action Context Types', 'MJ: Action Context Types'),
('Action Contexts', 'MJ: Action Contexts'),
('Action Execution Logs', 'MJ: Action Execution Logs'),
('Action Filters', 'MJ: Action Filters'),
('Action Libraries', 'MJ: Action Libraries'),
('Action Params', 'MJ: Action Params'),
('Action Result Codes', 'MJ: Action Result Codes'),
('Actions', 'MJ: Actions'),
('AI Actions', 'MJ: AI Actions'),
('AI Agent Actions', 'MJ: AI Agent Actions'),
('AI Agent Learning Cycles', 'MJ: AI Agent Learning Cycles'),
('AI Agent Models', 'MJ: AI Agent Models'),
('AI Agent Note Types', 'MJ: AI Agent Note Types'),
('AI Agent Notes', 'MJ: AI Agent Notes'),
('AI Agent Requests', 'MJ: AI Agent Requests'),
('AI Agents', 'MJ: AI Agents'),
('AI Model Actions', 'MJ: AI Model Actions'),
('AI Model Types', 'MJ: AI Model Types'),
('AI Models', 'MJ: AI Models'),
('AI Prompt Categories', 'MJ: AI Prompt Categories'),
('AI Prompt Types', 'MJ: AI Prompt Types'),
('AI Prompts', 'MJ: AI Prompts'),
('AI Result Cache', 'MJ: AI Result Cache'),
('Application Entities', 'MJ: Application Entities'),
('Application Settings', 'MJ: Application Settings'),
('Applications', 'MJ: Applications'),
('Audit Log Types', 'MJ: Audit Log Types'),
('Audit Logs', 'MJ: Audit Logs'),
('Authorization Roles', 'MJ: Authorization Roles'),
('Authorizations', 'MJ: Authorizations'),
('Communication Base Message Types', 'MJ: Communication Base Message Types'),
('Communication Logs', 'MJ: Communication Logs'),
('Communication Provider Message Types', 'MJ: Communication Provider Message Types'),
('Communication Providers', 'MJ: Communication Providers'),
('Communication Runs', 'MJ: Communication Runs'),
('Companies', 'MJ: Companies'),
('Company Integration Record Maps', 'MJ: Company Integration Record Maps'),
('Company Integration Run API Logs', 'MJ: Company Integration Run API Logs'),
('Company Integration Run Details', 'MJ: Company Integration Run Details'),
('Company Integration Runs', 'MJ: Company Integration Runs'),
('Company Integrations', 'MJ: Company Integrations'),
('Content File Types', 'MJ: Content File Types'),
('Content Item Attributes', 'MJ: Content Item Attributes'),
('Content Item Tags', 'MJ: Content Item Tags'),
('Content Items', 'MJ: Content Items'),
('Content Process Runs', 'MJ: Content Process Runs'),
('Content Source Params', 'MJ: Content Source Params'),
('Content Source Type Params', 'MJ: Content Source Type Params'),
('Content Source Types', 'MJ: Content Source Types'),
('Content Sources', 'MJ: Content Sources'),
('Content Type Attributes', 'MJ: Content Type Attributes'),
('Content Types', 'MJ: Content Types'),
('Conversation Details', 'MJ: Conversation Details'),
('Conversations', 'MJ: Conversations'),
('Dashboard Categories', 'MJ: Dashboard Categories'),
('Dashboards', 'MJ: Dashboards'),
('Data Context Items', 'MJ: Data Context Items'),
('Data Contexts', 'MJ: Data Contexts'),
('Dataset Items', 'MJ: Dataset Items'),
('Datasets', 'MJ: Datasets'),
('Duplicate Run Detail Matches', 'MJ: Duplicate Run Detail Matches'),
('Duplicate Run Details', 'MJ: Duplicate Run Details'),
('Duplicate Runs', 'MJ: Duplicate Runs'),
('Employee Company Integrations', 'MJ: Employee Company Integrations'),
('Employee Roles', 'MJ: Employee Roles'),
('Employee Skills', 'MJ: Employee Skills'),
('Employees', 'MJ: Employees'),
('Entities', 'MJ: Entities'),
('Entity Action Filters', 'MJ: Entity Action Filters'),
('Entity Action Invocation Types', 'MJ: Entity Action Invocation Types'),
('Entity Action Invocations', 'MJ: Entity Action Invocations'),
('Entity Action Params', 'MJ: Entity Action Params'),
('Entity Actions', 'MJ: Entity Actions'),
('Entity AI Actions', 'MJ: Entity AI Actions'),
('Entity Communication Fields', 'MJ: Entity Communication Fields'),
('Entity Communication Message Types', 'MJ: Entity Communication Message Types'),
('Entity Document Runs', 'MJ: Entity Document Runs'),
('Entity Document Settings', 'MJ: Entity Document Settings'),
('Entity Document Types', 'MJ: Entity Document Types'),
('Entity Documents', 'MJ: Entity Documents'),
('Entity Field Values', 'MJ: Entity Field Values'),
('Entity Fields', 'MJ: Entity Fields'),
('Entity Permissions', 'MJ: Entity Permissions'),
('Entity Record Documents', 'MJ: Entity Record Documents'),
('Entity Relationship Display Components', 'MJ: Entity Relationship Display Components'),
('Entity Relationships', 'MJ: Entity Relationships'),
('Entity Settings', 'MJ: Entity Settings'),
('Error Logs', 'MJ: Error Logs'),
('Explorer Navigation Items', 'MJ: Explorer Navigation Items'),
('File Categories', 'MJ: File Categories'),
('File Entity Record Links', 'MJ: File Entity Record Links'),
('File Storage Providers', 'MJ: File Storage Providers'),
('Files', 'MJ: Files'),
('Generated Code Categories', 'MJ: Generated Code Categories'),
('Generated Codes', 'MJ: Generated Codes'),
('Integration URL Formats', 'MJ: Integration URL Formats'),
('Integrations', 'MJ: Integrations'),
('Libraries', 'MJ: Libraries'),
('Library Items', 'MJ: Library Items'),
('List Categories', 'MJ: List Categories'),
('List Details', 'MJ: List Details'),
('Lists', 'MJ: Lists'),
('Output Delivery Types', 'MJ: Output Delivery Types'),
('Output Format Types', 'MJ: Output Format Types'),
('Output Trigger Types', 'MJ: Output Trigger Types'),
('Queries', 'MJ: Queries'),
('Query Categories', 'MJ: Query Categories'),
('Query Entities', 'MJ: Query Entities'),
('Query Fields', 'MJ: Query Fields'),
('Query Permissions', 'MJ: Query Permissions'),
('Queue Tasks', 'MJ: Queue Tasks'),
('Queue Types', 'MJ: Queue Types'),
('Queues', 'MJ: Queues'),
('Recommendation Items', 'MJ: Recommendation Items'),
('Recommendation Providers', 'MJ: Recommendation Providers'),
('Recommendation Runs', 'MJ: Recommendation Runs'),
('Recommendations', 'MJ: Recommendations'),
('Record Change Replay Runs', 'MJ: Record Change Replay Runs'),
('Record Changes', 'MJ: Record Changes'),
('Record Merge Deletion Logs', 'MJ: Record Merge Deletion Logs'),
('Record Merge Logs', 'MJ: Record Merge Logs'),
('Report Categories', 'MJ: Report Categories'),
('Report Snapshots', 'MJ: Report Snapshots'),
('Reports', 'MJ: Reports'),
('Resource Links', 'MJ: Resource Links'),
('Resource Permissions', 'MJ: Resource Permissions'),
('Resource Types', 'MJ: Resource Types'),
('Roles', 'MJ: Roles'),
('Row Level Security Filters', 'MJ: Row Level Security Filters'),
('Scheduled Action Params', 'MJ: Scheduled Action Params'),
('Scheduled Actions', 'MJ: Scheduled Actions'),
('Schema Info', 'MJ: Schema Info'),
('Skills', 'MJ: Skills'),
('Tagged Items', 'MJ: Tagged Items'),
('Tags', 'MJ: Tags'),
('Template Categories', 'MJ: Template Categories'),
('Template Content Types', 'MJ: Template Content Types'),
('Template Contents', 'MJ: Template Contents'),
('Template Params', 'MJ: Template Params'),
('Templates', 'MJ: Templates'),
('User Application Entities', 'MJ: User Application Entities'),
('User Applications', 'MJ: User Applications'),
('User Favorites', 'MJ: User Favorites'),
('User Notifications', 'MJ: User Notifications'),
('User Record Logs', 'MJ: User Record Logs'),
('User Roles', 'MJ: User Roles'),
('User View Categories', 'MJ: User View Categories'),
('User View Run Details', 'MJ: User View Run Details'),
('User View Runs', 'MJ: User View Runs'),
('User Views', 'MJ: User Views'),
('Users', 'MJ: Users'),
('Vector Databases', 'MJ: Vector Databases'),
('Vector Indexes', 'MJ: Vector Indexes'),
('Version Installations', 'MJ: Version Installations'),
('Workflow Engines', 'MJ: Workflow Engines'),
('Workflow Runs', 'MJ: Workflow Runs'),
('Workflows', 'MJ: Workflows'),
('Workspace Items', 'MJ: Workspace Items'),
('Workspaces', 'MJ: Workspaces');


-- ===================== FK & CHECK Constraints =====================


-- ===================== Grants =====================


-- ===================== Comments =====================


-- ===================== Other =====================

-- TODO: Review this batch
DROP TABLE #EntityNameMapping;

-- TODO: Review this batch
DROP PROCEDURE #UpdateEntityRefsInColumn;
