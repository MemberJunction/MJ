
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
	(ID, Name, Description, UserID, UIConfigDetails, Type, DriverClass, ApplicationID) 
VALUES 
	('F4C9433E-F36B-1410-8DAB-00021F8B792E', 'Entity Admin', 'Entity Administration Dashboard', 'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E', '', 'Code', 'EntityAdmin', 'DBCB423E-F36B-1410-8DAC-00021F8B792E')

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
INSERT INTO ${flyway:defaultSchema}.Application 
	(ID, Name, Description, DefaultForNewUser, Icon )
VALUES
	('7ACD423E-F36B-1410-8DAC-00021F8B792E', 'AI', 'AI Administration', 1, 'fa-solid fa-robot')

INSERT INTO ${flyway:defaultSchema}.Dashboard 
	(ID, Name, Description, UserID, UIConfigDetails, Type, DriverClass, ApplicationID) 
VALUES 
	('7DCD423E-F36B-1410-8DAC-00021F8B792E', 'AI Admin', 'AI Administration Dashboard', 'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E', '', 'Code', 'AIDashboard', '7ACD423E-F36B-1410-8DAC-00021F8B792E')

INSERT INTO ${flyway:defaultSchema}.DashboardUserPreference 
	(DashboardID, ApplicationID, Scope, DisplayOrder)
VALUES 
	('7DCD423E-F36B-1410-8DAC-00021F8B792E','7ACD423E-F36B-1410-8DAC-00021F8B792E','App',0)
   

-- Create the ApplicationEntity records to link AI entities to the AI application
-- HIGH PRIORITY - DefaultForNewUser = 1 (shown by default to new users)
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity 
    (ApplicationID, EntityID, DefaultForNewUser, Sequence)
VALUES
    ('7ACD423E-F36B-1410-8DAC-00021F8B792E', (SELECT ID FROM ${flyway:defaultSchema}.Entity WHERE Name = 'AI Models'), 1, 1 ), --AI Models
    ('7ACD423E-F36B-1410-8DAC-00021F8B792E', (SELECT ID FROM ${flyway:defaultSchema}.Entity WHERE Name = 'AI Model Types'), 1, 2 ), --AI Model Types
    ('7ACD423E-F36B-1410-8DAC-00021F8B792E', (SELECT ID FROM ${flyway:defaultSchema}.Entity WHERE Name = 'AI Agents'), 1, 3 ), --AI Agents
    ('7ACD423E-F36B-1410-8DAC-00021F8B792E', (SELECT ID FROM ${flyway:defaultSchema}.Entity WHERE Name = 'AI Prompts'), 1, 4 ), --AI Prompts
    ('7ACD423E-F36B-1410-8DAC-00021F8B792E', (SELECT ID FROM ${flyway:defaultSchema}.Entity WHERE Name = 'Conversations'), 1, 5 ), --Conversations
    ('7ACD423E-F36B-1410-8DAC-00021F8B792E', (SELECT ID FROM ${flyway:defaultSchema}.Entity WHERE Name = 'Conversation Details'), 1, 6 ), --Conversation Details

-- MEDIUM PRIORITY - DefaultForNewUser = 0 (available but not shown by default)
    ('7ACD423E-F36B-1410-8DAC-00021F8B792E', (SELECT ID FROM ${flyway:defaultSchema}.Entity WHERE Name = 'AI Agent Models'), 0, 11 ), --AI Agent Models
    ('7ACD423E-F36B-1410-8DAC-00021F8B792E', (SELECT ID FROM ${flyway:defaultSchema}.Entity WHERE Name = 'AI Agent Actions'), 0, 12 ), --AI Agent Actions
    ('7ACD423E-F36B-1410-8DAC-00021F8B792E', (SELECT ID FROM ${flyway:defaultSchema}.Entity WHERE Name = 'AI Prompt Categories'), 0, 13 ), --AI Prompt Categories
    ('7ACD423E-F36B-1410-8DAC-00021F8B792E', (SELECT ID FROM ${flyway:defaultSchema}.Entity WHERE Name = 'AI Prompt Types'), 0, 14 ), --AI Prompt Types
    ('7ACD423E-F36B-1410-8DAC-00021F8B792E', (SELECT ID FROM ${flyway:defaultSchema}.Entity WHERE Name = 'AI Model Actions'), 0, 15 ), --AI Model Actions

-- LOW PRIORITY - DefaultForNewUser = 0 (advanced features and logging)
    ('7ACD423E-F36B-1410-8DAC-00021F8B792E', (SELECT ID FROM ${flyway:defaultSchema}.Entity WHERE Name = 'AI Agent Requests'), 0, 21 ), --AI Agent Requests
    ('7ACD423E-F36B-1410-8DAC-00021F8B792E', (SELECT ID FROM ${flyway:defaultSchema}.Entity WHERE Name = 'AI Agent Learning Cycles'), 0, 22 ), --AI Agent Learning Cycles
    ('7ACD423E-F36B-1410-8DAC-00021F8B792E', (SELECT ID FROM ${flyway:defaultSchema}.Entity WHERE Name = 'AI Agent Notes'), 0, 23 ), --AI Agent Notes
    ('7ACD423E-F36B-1410-8DAC-00021F8B792E', (SELECT ID FROM ${flyway:defaultSchema}.Entity WHERE Name = 'AI Agent Note Types'), 0, 24 ), --AI Agent Note Types
    ('7ACD423E-F36B-1410-8DAC-00021F8B792E', (SELECT ID FROM ${flyway:defaultSchema}.Entity WHERE Name = 'AI Result Cache'), 0, 25 ) --AI Result Cache




/****************************************************/
/********* Actions App + Dashboard Creation *********/
/****************************************************/
INSERT INTO ${flyway:defaultSchema}.Application 
	(ID, Name, Description, DefaultForNewUser, Icon )
VALUES
	('02D5423E-F36B-1410-8DAC-00021F8B792E', 'Actions', 'Actions Framework', 1, 'fa-solid fa-hat-wizard')

INSERT INTO ${flyway:defaultSchema}.Dashboard 
	(ID, Name, Description, UserID, 
     UIConfigDetails, Type, DriverClass, ApplicationID) 
VALUES 
	('0BD5423E-F36B-1410-8DAC-00021F8B792E', 'Actions', 'Actions Framework Dashboard', 'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E', 
     '', 'Code', 'ActionsManagement', '02D5423E-F36B-1410-8DAC-00021F8B792E')

INSERT INTO ${flyway:defaultSchema}.DashboardUserPreference 
	(ID, DashboardID, ApplicationID, Scope, DisplayOrder)
VALUES 
	('12D5423E-F36B-1410-8DAC-00021F8B792E', '0BD5423E-F36B-1410-8DAC-00021F8B792E','02D5423E-F36B-1410-8DAC-00021F8B792E','App',0)

-- Create the ApplicationEntity records to link Actions entities to the Actions application
-- HIGH PRIORITY - DefaultForNewUser = 1 (shown by default to new users)
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity 
    (ApplicationID, EntityID, DefaultForNewUser, Sequence)
VALUES
    ('02D5423E-F36B-1410-8DAC-00021F8B792E', (SELECT ID FROM ${flyway:defaultSchema}.Entity WHERE Name = 'Actions'), 1, 1 ), --Actions
    ('02D5423E-F36B-1410-8DAC-00021F8B792E', (SELECT ID FROM ${flyway:defaultSchema}.Entity WHERE Name = 'Action Categories'), 1, 2 ), --Action Categories
    ('02D5423E-F36B-1410-8DAC-00021F8B792E', (SELECT ID FROM ${flyway:defaultSchema}.Entity WHERE Name = 'Action Execution Logs'), 1, 3 ), --Action Execution Logs
    ('02D5423E-F36B-1410-8DAC-00021F8B792E', (SELECT ID FROM ${flyway:defaultSchema}.Entity WHERE Name = 'Entity Actions'), 1, 4 ), --Entity Actions
    ('02D5423E-F36B-1410-8DAC-00021F8B792E', (SELECT ID FROM ${flyway:defaultSchema}.Entity WHERE Name = 'Action Params'), 1, 5 ), --Action Params
    ('02D5423E-F36B-1410-8DAC-00021F8B792E', (SELECT ID FROM ${flyway:defaultSchema}.Entity WHERE Name = 'Scheduled Actions'), 1, 6 ), --Scheduled Actions

-- MEDIUM PRIORITY - DefaultForNewUser = 0 (available but not shown by default)
    ('02D5423E-F36B-1410-8DAC-00021F8B792E', (SELECT ID FROM ${flyway:defaultSchema}.Entity WHERE Name = 'Action Libraries'), 0, 11 ), --Action Libraries
    ('02D5423E-F36B-1410-8DAC-00021F8B792E', (SELECT ID FROM ${flyway:defaultSchema}.Entity WHERE Name = 'Action Result Codes'), 0, 12 ), --Action Result Codes
    ('02D5423E-F36B-1410-8DAC-00021F8B792E', (SELECT ID FROM ${flyway:defaultSchema}.Entity WHERE Name = 'Action Filters'), 0, 13 ), --Action Filters
    ('02D5423E-F36B-1410-8DAC-00021F8B792E', (SELECT ID FROM ${flyway:defaultSchema}.Entity WHERE Name = 'Action Authorizations'), 0, 14 ), --Action Authorizations
    ('02D5423E-F36B-1410-8DAC-00021F8B792E', (SELECT ID FROM ${flyway:defaultSchema}.Entity WHERE Name = 'Scheduled Action Params'), 0, 15 ), --Scheduled Action Params
    ('02D5423E-F36B-1410-8DAC-00021F8B792E', (SELECT ID FROM ${flyway:defaultSchema}.Entity WHERE Name = 'Action Context Types'), 0, 16 ), --Action Context Types
    ('02D5423E-F36B-1410-8DAC-00021F8B792E', (SELECT ID FROM ${flyway:defaultSchema}.Entity WHERE Name = 'Action Contexts'), 0, 17 ), --Action Contexts

-- LOW PRIORITY - DefaultForNewUser = 0 (AI and advanced features)
    ('02D5423E-F36B-1410-8DAC-00021F8B792E', (SELECT ID FROM ${flyway:defaultSchema}.Entity WHERE Name = 'Entity Action Params'), 0, 23 ), --Entity Action Params
    ('02D5423E-F36B-1410-8DAC-00021F8B792E', (SELECT ID FROM ${flyway:defaultSchema}.Entity WHERE Name = 'Entity Action Invocation Types'), 0, 24 ), --Entity Action Invocation Types
    ('02D5423E-F36B-1410-8DAC-00021F8B792E', (SELECT ID FROM ${flyway:defaultSchema}.Entity WHERE Name = 'Entity Action Invocations'), 0, 25 ), --Entity Action Invocations
    ('02D5423E-F36B-1410-8DAC-00021F8B792E', (SELECT ID FROM ${flyway:defaultSchema}.Entity WHERE Name = 'Entity Action Filters'), 0, 26 ) --Entity Action Filters


-- Allow Developer Role to have edit on *AI Prompt* entities
UPDATE ${flyway:defaultSchema}.EntityPermission SET CanCreate=1,CanUpdate=1,CanDelete=1 WHERE ID IN (
      SELECT ID FROM ${flyway:defaultSchema}.vwEntityPermissions WHERE RoleName='Developer' AND 
	                       Entity LIKE '%AI Prompt%'
);

-- CREATE AI Prompt Types
INSERT INTO ${flyway:defaultSchema}.AIPromptType (ID, Name, Description)
VALUES ('A6DA423E-F36B-1410-8DAC-00021F8B792E', 'Chat','LLM Chat');

INSERT INTO ${flyway:defaultSchema}.AIPromptType (ID, Name, Description)
VALUES ('ABDA423E-F36B-1410-8DAC-00021F8B792E', 'Text To Video (TTV)','Uses a generative video model to convert text to video');

INSERT INTO ${flyway:defaultSchema}.AIPromptType (ID, Name, Description)
VALUES ('B0DA423E-F36B-1410-8DAC-00021F8B792E', 'Text To Speech','Uses a generative audio model to convert text to speech');

INSERT INTO ${flyway:defaultSchema}.AIPromptType (ID, Name, Description)
VALUES ('B5DA423E-F36B-1410-8DAC-00021F8B792E', 'Audio to Text','Uses an audio model to convert speech to text (transcript)');

INSERT INTO ${flyway:defaultSchema}.AIPromptType (ID, Name, Description)
VALUES ('BADA423E-F36B-1410-8DAC-00021F8B792E', 'Video to Text','Uses a video model to convert the audio portion of a video to text (transcript)');

INSERT INTO ${flyway:defaultSchema}.AIPromptType (ID, Name, Description)
VALUES ('BFDA423E-F36B-1410-8DAC-00021F8B792E', 'Generate Image','Uses a generative image model to convert text to an image');



/****************************************************/
/********* Template Content Types Support for more Types *********/
/****************************************************/
ALTER TABLE [${flyway:defaultSchema}].[TemplateContentType] DROP CONSTRAINT [CK_TemplateContentType_CodeType]
ALTER TABLE [${flyway:defaultSchema}].[TemplateContentType]  WITH CHECK 
ADD  CONSTRAINT [CK_TemplateContentType_CodeType] CHECK  
(CodeType IN ('TypeScript','HTML','CSS','JavaScript','JSON','Python','Nunjucks','Other'))


-- CodeGen to fix up from the above

/* SQL text to delete entity field value ID 8452302D-7236-EF11-86D4-6045BDEE16E6 */
DELETE FROM [${flyway:defaultSchema}].EntityFieldValue WHERE ID='8452302D-7236-EF11-86D4-6045BDEE16E6'

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('FC5817F0-6F36-EF11-86D4-6045BDEE16E6', 6, 'Nunjucks', 'Nunjucks')

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].EntityFieldValue SET Sequence=2 WHERE ID='8552302D-7236-EF11-86D4-6045BDEE16E6'

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].EntityFieldValue SET Sequence=3 WHERE ID='8652302D-7236-EF11-86D4-6045BDEE16E6'

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].EntityFieldValue SET Sequence=4 WHERE ID='8752302D-7236-EF11-86D4-6045BDEE16E6'

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].EntityFieldValue SET Sequence=5 WHERE ID='4ECE433E-F36B-1410-8DAB-00021F8B792E'





/* SQL text to delete entity field value ID 4ECE433E-F36B-1410-8DAB-00021F8B792E */
DELETE FROM [${flyway:defaultSchema}].EntityFieldValue WHERE ID='4ECE433E-F36B-1410-8DAB-00021F8B792E'

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('FC5817F0-6F36-EF11-86D4-6045BDEE16E6', 5, 'JSON', 'JSON')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('FC5817F0-6F36-EF11-86D4-6045BDEE16E6', 6, 'Python', 'Python')

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].EntityFieldValue SET Sequence=7 WHERE ID='97E3423E-F36B-1410-8DAC-00021F8B792E'

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].EntityFieldValue SET Sequence=8 WHERE ID='8952302D-7236-EF11-86D4-6045BDEE16E6'

/* SQL text to delete entity field value ID 5DCE433E-F36B-1410-8DAB-00021F8B792E */
DELETE FROM [${flyway:defaultSchema}].EntityFieldValue WHERE ID='5DCE433E-F36B-1410-8DAB-00021F8B792E'

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('4EBEB02B-AC46-4440-948F-0FCD6C6C26DE', 4, 'JSON', 'JSON')


/****************************************************/
/********* Dashboard Metadata to MJ_Metadata dataset *********/
/****************************************************/



INSERT INTO ${flyway:defaultSchema}.DatasetItem 
	(
		Code, 
		DatasetID, 
		Sequence, 
		EntityID, 
		DateFieldToCheck,
		__mj_CreatedAt,
		__mj_UpdatedAt
	)
VALUES 
	(
		'Dashboards',
		'E4ADCCEC-6A37-EF11-86D4-000D3A4E707E', 
		23, 
		'05248F34-2837-EF11-86D4-6045BDEE16E6', -- Dashboards
		'__mj_UpdatedAt',
		'2025-05-21 19:53:15.9200000 +00:00',
		'2025-05-21 19:53:15.9200000 +00:00'
	)

INSERT INTO ${flyway:defaultSchema}.DatasetItem 
	(
		Code, 
		DatasetID, 
		Sequence, 
		EntityID, 
		DateFieldToCheck,
		__mj_CreatedAt,
		__mj_UpdatedAt
	)
VALUES 
	(
		'Dashboard_Categories',
		'E4ADCCEC-6A37-EF11-86D4-000D3A4E707E', 
		24, 
		'26248F34-2837-EF11-86D4-6045BDEE16E6', -- Dashboard Categories
		'__mj_UpdatedAt',
		'2025-05-21 19:53:15.9200000 +00:00',
		'2025-05-21 19:53:15.9200000 +00:00'
	)
