
-- Hello World Demo Dashboard
INSERT INTO ${flyway:defaultSchema}.Dashboard 
	(ID, Name, Description, UserID, UIConfigDetails, Type, DriverClass) 
VALUES 
	('41C7433E-F36B-1410-8DAB-00021F8B792E', 'Hello World', 'Hello World, Demo Dashboard', 'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E', '', 'Code', 'HelloDemo')
-- NOT WIRED UP - there is no Dashboard User Preference for this dashboard - can be added later by admin to turn on



-- Entity Admin App and Dashboard Creation
INSERT INTO ${flyway:defaultSchema}.Application 
	(ID, Name, Description, DefaultForNewUser, Icon )
VALUES
	('DBCB423E-F36B-1410-8DAC-00021F8B792E', 'Entity Admin','Entity Administration', 1, 'fa-solid fa-database')

INSERT INTO ${flyway:defaultSchema}.Dashboard 
	(ID, Name, Description, UserID, UIConfigDetails, Type, DriverClass) 
VALUES 
	('F4C9433E-F36B-1410-8DAB-00021F8B792E', 'Entity Admin', 'Entity Administration Dashboard', 'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E', '', 'Code', 'EntityAdmin')

INSERT INTO ${flyway:defaultSchema}.DashboardUserPreference 
	(ID, DashboardID, ApplicationID, Scope, DisplayOrder)
VALUES 
	('02CC423E-F36B-1410-8DAC-00021F8B792E', 'F4C9433E-F36B-1410-8DAB-00021F8B792E','DBCB423E-F36B-1410-8DAC-00021F8B792E','App',0)

-- Create the ApplicationEntity records to link entities to the Entity Admin application
-- HIGH PRIORITY - DefaultForNewUser = 1 (shown by default to new users)
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity 
    (ApplicationID, EntityID, DefaultForNewUser, Sequence)
VALUES
    ('DBCB423E-F36B-1410-8DAC-00021F8B792E', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 1, 1 ), --Entities
    ('DBCB423E-F36B-1410-8DAC-00021F8B792E', (SELECT ID FROM ${flyway:defaultSchema}.Entity WHERE Name = 'Entity Fields'), 1, 2 ), --Entity Fields
    ('DBCB423E-F36B-1410-8DAC-00021F8B792E', (SELECT ID FROM ${flyway:defaultSchema}.Entity WHERE Name = 'Entity Field Values'), 1, 3 ), --Entity Field Values
    ('DBCB423E-F36B-1410-8DAC-00021F8B792E', (SELECT ID FROM ${flyway:defaultSchema}.Entity WHERE Name = 'Entity Relationships'), 1, 4 ), --Entity Relationships
    ('DBCB423E-F36B-1410-8DAC-00021F8B792E', (SELECT ID FROM ${flyway:defaultSchema}.Entity WHERE Name = 'Entity Permissions'), 1, 5 ), --Entity Permissions
    ('DBCB423E-F36B-1410-8DAC-00021F8B792E', (SELECT ID FROM ${flyway:defaultSchema}.Entity WHERE Name = 'Entity Actions'), 1, 6 ), --Entity Actions
    ('DBCB423E-F36B-1410-8DAC-00021F8B792E', (SELECT ID FROM ${flyway:defaultSchema}.Entity WHERE Name = 'Entity Settings'), 1, 7 ), --Entity Settings

-- MEDIUM PRIORITY - DefaultForNewUser = 0 (available but not shown by default)
    ('DBCB423E-F36B-1410-8DAC-00021F8B792E', (SELECT ID FROM ${flyway:defaultSchema}.Entity WHERE Name = 'Application Entities'), 0, 11 ), --Application Entities
    ('DBCB423E-F36B-1410-8DAC-00021F8B792E', (SELECT ID FROM ${flyway:defaultSchema}.Entity WHERE Name = 'User Application Entities'), 0, 12 ), --User Application Entities
    ('DBCB423E-F36B-1410-8DAC-00021F8B792E', (SELECT ID FROM ${flyway:defaultSchema}.Entity WHERE Name = 'Entity Action Params'), 0, 13 ), --Entity Action Params
    ('DBCB423E-F36B-1410-8DAC-00021F8B792E', (SELECT ID FROM ${flyway:defaultSchema}.Entity WHERE Name = 'Entity Action Invocation Types'), 0, 14 ), --Entity Action Invocation Types
    ('DBCB423E-F36B-1410-8DAC-00021F8B792E', (SELECT ID FROM ${flyway:defaultSchema}.Entity WHERE Name = 'Entity Action Invocations'), 0, 15 ), --Entity Action Invocations
    ('DBCB423E-F36B-1410-8DAC-00021F8B792E', (SELECT ID FROM ${flyway:defaultSchema}.Entity WHERE Name = 'Entity Action Filters'), 0, 16 ), --Entity Action Filters
    ('DBCB423E-F36B-1410-8DAC-00021F8B792E', (SELECT ID FROM ${flyway:defaultSchema}.Entity WHERE Name = 'Entity Documents'), 0, 17 ), --Entity Documents
    ('DBCB423E-F36B-1410-8DAC-00021F8B792E', (SELECT ID FROM ${flyway:defaultSchema}.Entity WHERE Name = 'Entity Document Types'), 0, 18 ), --Entity Document Types

-- LOW PRIORITY - DefaultForNewUser = 0 (specialized/advanced features)
    ('DBCB423E-F36B-1410-8DAC-00021F8B792E', (SELECT ID FROM ${flyway:defaultSchema}.Entity WHERE Name = 'Entity Document Settings'), 0, 21 ), --Entity Document Settings
    ('DBCB423E-F36B-1410-8DAC-00021F8B792E', (SELECT ID FROM ${flyway:defaultSchema}.Entity WHERE Name = 'Entity Document Runs'), 0, 22 ), --Entity Document Runs
    ('DBCB423E-F36B-1410-8DAC-00021F8B792E', (SELECT ID FROM ${flyway:defaultSchema}.Entity WHERE Name = 'Entity Record Documents'), 0, 23 ), --Entity Record Documents
    ('DBCB423E-F36B-1410-8DAC-00021F8B792E', (SELECT ID FROM ${flyway:defaultSchema}.Entity WHERE Name = 'Entity Communication Fields'), 0, 24 ), --Entity Communication Fields
    ('DBCB423E-F36B-1410-8DAC-00021F8B792E', (SELECT ID FROM ${flyway:defaultSchema}.Entity WHERE Name = 'Entity Communication Message Types'), 0, 25 ), --Entity Communication Message Types
    ('DBCB423E-F36B-1410-8DAC-00021F8B792E', (SELECT ID FROM ${flyway:defaultSchema}.Entity WHERE Name = 'Entity Relationship Display Components'), 0, 26 ), --Entity Relationship Display Components
    ('DBCB423E-F36B-1410-8DAC-00021F8B792E', (SELECT ID FROM ${flyway:defaultSchema}.Entity WHERE Name = 'Entity AI Actions'), 0, 27 ), --Entity AI Actions
    ('DBCB423E-F36B-1410-8DAC-00021F8B792E', (SELECT ID FROM ${flyway:defaultSchema}.Entity WHERE Name = 'File Entity Record Links'), 0, 28 ) --File Entity Record Links



-------- AI App + Dashboard Creation
INSERT INTO __mj.Application 
	(ID, Name, Description, DefaultForNewUser, Icon )
VALUES
	('7ACD423E-F36B-1410-8DAC-00021F8B792E', 'AI', 'AI Administration', 1, 'fa-solid fa-robot')

INSERT INTO __mj.Dashboard 
	(ID, Name, Description, UserID, UIConfigDetails, Type, DriverClass) 
VALUES 
	('7DCD423E-F36B-1410-8DAC-00021F8B792E', 'AI Admin', 'AI Administration Dashboard', 'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E', '', 'Code', 'AIDashboard')

INSERT INTO __mj.DashboardUserPreference 
	(DashboardID, ApplicationID, Scope, DisplayOrder)
VALUES 
	('7DCD423E-F36B-1410-8DAC-00021F8B792E','7ACD423E-F36B-1410-8DAC-00021F8B792E','App',0)
   

-- Create the ApplicationEntity records to link AI entities to the AI application
-- HIGH PRIORITY - DefaultForNewUser = 1 (shown by default to new users)
INSERT INTO __mj.ApplicationEntity 
    (ApplicationID, EntityID, DefaultForNewUser, Sequence)
VALUES
    ('7ACD423E-F36B-1410-8DAC-00021F8B792E', (SELECT ID FROM __mj.Entity WHERE Name = 'AI Models'), 1, 1 ), --AI Models
    ('7ACD423E-F36B-1410-8DAC-00021F8B792E', (SELECT ID FROM __mj.Entity WHERE Name = 'AI Model Types'), 1, 2 ), --AI Model Types
    ('7ACD423E-F36B-1410-8DAC-00021F8B792E', (SELECT ID FROM __mj.Entity WHERE Name = 'AI Agents'), 1, 3 ), --AI Agents
    ('7ACD423E-F36B-1410-8DAC-00021F8B792E', (SELECT ID FROM __mj.Entity WHERE Name = 'AI Prompts'), 1, 4 ), --AI Prompts
    ('7ACD423E-F36B-1410-8DAC-00021F8B792E', (SELECT ID FROM __mj.Entity WHERE Name = 'Conversations'), 1, 5 ), --Conversations
    ('7ACD423E-F36B-1410-8DAC-00021F8B792E', (SELECT ID FROM __mj.Entity WHERE Name = 'Conversation Details'), 1, 6 ), --Conversation Details

-- MEDIUM PRIORITY - DefaultForNewUser = 0 (available but not shown by default)
    ('7ACD423E-F36B-1410-8DAC-00021F8B792E', (SELECT ID FROM __mj.Entity WHERE Name = 'AI Agent Models'), 0, 11 ), --AI Agent Models
    ('7ACD423E-F36B-1410-8DAC-00021F8B792E', (SELECT ID FROM __mj.Entity WHERE Name = 'AI Agent Actions'), 0, 12 ), --AI Agent Actions
    ('7ACD423E-F36B-1410-8DAC-00021F8B792E', (SELECT ID FROM __mj.Entity WHERE Name = 'AI Prompt Categories'), 0, 13 ), --AI Prompt Categories
    ('7ACD423E-F36B-1410-8DAC-00021F8B792E', (SELECT ID FROM __mj.Entity WHERE Name = 'AI Prompt Types'), 0, 14 ), --AI Prompt Types
    ('7ACD423E-F36B-1410-8DAC-00021F8B792E', (SELECT ID FROM __mj.Entity WHERE Name = 'AI Model Actions'), 0, 15 ), --AI Model Actions

-- LOW PRIORITY - DefaultForNewUser = 0 (advanced features and logging)
    ('7ACD423E-F36B-1410-8DAC-00021F8B792E', (SELECT ID FROM __mj.Entity WHERE Name = 'AI Agent Requests'), 0, 21 ), --AI Agent Requests
    ('7ACD423E-F36B-1410-8DAC-00021F8B792E', (SELECT ID FROM __mj.Entity WHERE Name = 'AI Agent Learning Cycles'), 0, 22 ), --AI Agent Learning Cycles
    ('7ACD423E-F36B-1410-8DAC-00021F8B792E', (SELECT ID FROM __mj.Entity WHERE Name = 'AI Agent Notes'), 0, 23 ), --AI Agent Notes
    ('7ACD423E-F36B-1410-8DAC-00021F8B792E', (SELECT ID FROM __mj.Entity WHERE Name = 'AI Agent Note Types'), 0, 24 ), --AI Agent Note Types
    ('7ACD423E-F36B-1410-8DAC-00021F8B792E', (SELECT ID FROM __mj.Entity WHERE Name = 'AI Result Cache'), 0, 25 ) --AI Result Cache


