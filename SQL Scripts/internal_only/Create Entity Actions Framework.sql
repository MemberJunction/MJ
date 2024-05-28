CREATE TABLE __mj.ActionCategory ( -- Organizes actions into categories, including name, description, and optional parent category for hierarchy.
    ID INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    Name NVARCHAR(255) NOT NULL, -- Name of the action category.
    Description NVARCHAR(MAX) NULL, -- Description of the action category.
    ParentID INT NULL, -- Parent category ID for hierarchical organization.
    Status NVARCHAR(20) NOT NULL DEFAULT 'Pending' CHECK (Status IN ('Pending', 'Active', 'Disabled')), -- Status of the action category (Pending, Active, Disabled).
    CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
    UpdatedAt DATETIME NOT NULL DEFAULT GETDATE(),
    FOREIGN KEY (ParentID) REFERENCES __mj.ActionCategory(ID)
);
EXEC sp_addextendedproperty @name = N'ms_description', @value = N'Organizes actions into categories, including name, description, and optional parent category for hierarchy.', @level0type = N'SCHEMA', @level0name = N'__mj', @level1type = N'TABLE', @level1name = N'ActionCategory';
EXEC sp_addextendedproperty @name = N'ms_description', @value = N'Name of the action category.', @level0type = N'SCHEMA', @level0name = N'__mj', @level1type = N'TABLE', @level1name = N'ActionCategory', @level2type = N'COLUMN', @level2name = N'Name';
EXEC sp_addextendedproperty @name = N'ms_description', @value = N'Description of the action category.', @level0type = N'SCHEMA', @level0name = N'__mj', @level1type = N'TABLE', @level1name = N'ActionCategory', @level2type = N'COLUMN', @level2name = N'Description';
EXEC sp_addextendedproperty @name = N'ms_description', @value = N'Parent category ID for hierarchical organization.', @level0type = N'SCHEMA', @level0name = N'__mj', @level1type = N'TABLE', @level1name = N'ActionCategory', @level2type = N'COLUMN', @level2name = N'ParentID';
EXEC sp_addextendedproperty @name = N'ms_description', @value = N'Status of the action category (Pending, Active, Disabled).', @level0type = N'SCHEMA', @level0name = N'__mj', @level1type = N'TABLE', @level1name = N'ActionCategory', @level2type = N'COLUMN', @level2name = N'Status';




CREATE TABLE __mj.Action ( -- Stores action definitions, including prompts, generated code, user comments, and status.
    ID INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    CategoryID INT NULL,
    UserPrompt NVARCHAR(MAX) NOT NULL,
    UserComments NVARCHAR(MAX) NULL, -- User's comments not shared with the LLM.
    Code NVARCHAR(MAX),
    CodeComments NVARCHAR(MAX) NULL, -- AI's explanation of the code.
	CodeApprovalStatus NVARCHAR(20) NOT NULL DEFAULT 'Pending' CHECK (CodeApprovalStatus IN ('Pending', 'Approved', 'Rejected')), -- an action won't be usable until the code is approved
	CodeApprovalComments NVARCHAR(MAX) NULL, -- optional comments when an individual (or an AI) reviews and approves the code
	CodeApprovedByUserID INT NULL, -- UserID who approved the code
	CodeApprovedAt DATETIME NULL, -- when the code was approved
    RetentionPeriod INT, -- Number of days to retain execution logs; NULL for indefinite.
    Status NVARCHAR(20) NOT NULL DEFAULT 'Pending' CHECK (Status IN ('Pending', 'Active', 'Disabled')), -- Status of the action (Pending, Active, Disabled).
    CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
    UpdatedAt DATETIME NOT NULL DEFAULT GETDATE(),
    FOREIGN KEY (CategoryID) REFERENCES __mj.ActionCategory(ID),
    FOREIGN KEY (CodeApprovedByUserID) REFERENCES __mj.[User](ID)
);
EXEC sp_addextendedproperty @name = N'ms_description', @value = N'Stores action definitions, including prompts, generated code, user comments, and status.', @level0type = N'SCHEMA', @level0name = N'__mj', @level1type = N'TABLE', @level1name = N'Action';
EXEC sp_addextendedproperty @name = N'ms_description', @value = N'User''s comments not shared with the LLM.', @level0type = N'SCHEMA', @level0name = N'__mj', @level1type = N'TABLE', @level1name = N'Action', @level2type = N'COLUMN', @level2name = N'UserComments';
EXEC sp_addextendedproperty @name = N'ms_description', @value = N'AI''s explanation of the code.', @level0type = N'SCHEMA', @level0name = N'__mj', @level1type = N'TABLE', @level1name = N'Action', @level2type = N'COLUMN', @level2name = N'CodeComments';
EXEC sp_addextendedproperty @name = N'ms_description', @value = N'An action won''t be usable until the code is approved.', @level0type = N'SCHEMA', @level0name = N'__mj', @level1type = N'TABLE', @level1name = N'Action', @level2type = N'COLUMN', @level2name = N'CodeApprovalStatus';
EXEC sp_addextendedproperty @name = N'ms_description', @value = N'Optional comments when an individual (or an AI) reviews and approves the code.', @level0type = N'SCHEMA', @level0name = N'__mj', @level1type = N'TABLE', @level1name = N'Action', @level2type = N'COLUMN', @level2name = N'CodeApprovalComments';
EXEC sp_addextendedproperty @name = N'ms_description', @value = N'UserID who approved the code.', @level0type = N'SCHEMA', @level0name = N'__mj', @level1type = N'TABLE', @level1name = N'Action', @level2type = N'COLUMN', @level2name = N'CodeApprovedByUserID';
EXEC sp_addextendedproperty @name = N'ms_description', @value = N'When the code was approved.', @level0type = N'SCHEMA', @level0name = N'__mj', @level1type = N'TABLE', @level1name = N'Action', @level2type = N'COLUMN', @level2name = N'CodeApprovedAt';
EXEC sp_addextendedproperty @name = N'ms_description', @value = N'Number of days to retain execution logs; NULL for indefinite.', @level0type = N'SCHEMA', @level0name = N'__mj', @level1type = N'TABLE', @level1name = N'Action', @level2type = N'COLUMN', @level2name = N'RetentionPeriod';
EXEC sp_addextendedproperty @name = N'ms_description', @value = N'Status of the action (Pending, Active, Disabled).', @level0type = N'SCHEMA', @level0name = N'__mj', @level1type = N'TABLE', @level1name = N'Action', @level2type = N'COLUMN', @level2name = N'Status';


CREATE TABLE __mj.ActionAuthorization ( -- Links actions to authorizations, one or more of these must be possessed by a user in order to execute the action.
    ID INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    ActionID INT NOT NULL,
    AuthorizationID INT NOT NULL,
	Comments NVARCHAR(MAX) NULL,
    CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
    UpdatedAt DATETIME NOT NULL DEFAULT GETDATE(),
    FOREIGN KEY (ActionID) REFERENCES __mj.Action(ID),
    FOREIGN KEY (AuthorizationID) REFERENCES __mj.[Authorization](ID)
);
EXEC sp_addextendedproperty @name = N'ms_description', @value = N'Links actions to authorizations, one or more of these must be possessed by a user in order to execute the action.', @level0type = N'SCHEMA', @level0name = N'__mj', @level1type = N'TABLE', @level1name = N'ActionAuthorization';


CREATE TABLE __mj.ActionInput ( -- Defines the expected input properties for an action to execute.
    ID INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    ActionID INT NOT NULL,
    Name NVARCHAR(255) NOT NULL, -- Key for the input.
    DefaultValue NVARCHAR(MAX) NULL, -- Default value for the action, can be overriden at run time by the caller of the action.
    Description NVARCHAR(MAX) NULL, -- Description of the input.
	IsRequired BIT NOT NULL DEFAULT 0, -- Specifies if the input property is required when executing the action or not.
    CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
    UpdatedAt DATETIME NOT NULL DEFAULT GETDATE(),
    FOREIGN KEY (ActionID) REFERENCES __mj.Action(ID)
);
EXEC sp_addextendedproperty @name = N'ms_description', @value = N'Defines the expected input properties for an action to execute.', @level0type = N'SCHEMA', @level0name = N'__mj', @level1type = N'TABLE', @level1name = N'ActionInput';
EXEC sp_addextendedproperty @name = N'ms_description', @value = N'Key for the input.', @level0type = N'SCHEMA', @level0name = N'__mj', @level1type = N'TABLE', @level1name = N'ActionInput', @level2type = N'COLUMN', @level2name = N'Name';
EXEC sp_addextendedproperty @name = N'ms_description', @value = N'Default value for the action, can be overriden at run time by the caller of the action.', @level0type = N'SCHEMA', @level0name = N'__mj', @level1type = N'TABLE', @level1name = N'ActionInput', @level2type = N'COLUMN', @level2name = N'DefaultValue';
EXEC sp_addextendedproperty @name = N'ms_description', @value = N'Description of the input.', @level0type = N'SCHEMA', @level0name = N'__mj', @level1type = N'TABLE', @level1name = N'ActionInput', @level2type = N'COLUMN', @level2name = N'Description';
EXEC sp_addextendedproperty @name = N'ms_description', @value = N'Specifies if the input property is required when executing the action or not.', @level0type = N'SCHEMA', @level0name = N'__mj', @level1type = N'TABLE', @level1name = N'ActionInput', @level2type = N'COLUMN', @level2name = N'IsRequired';



CREATE TABLE __mj.ActionOutput ( -- Tracks outputs, which are optional, from an action, including names, values, and descriptions.
    ID INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    ActionID INT NOT NULL,
    Name NVARCHAR(255) NOT NULL, -- Name of the output variable the action will produce.
    DefaultValue NVARCHAR(MAX) NULL, -- Default value of the output.
    Description NVARCHAR(MAX) NULL,  
	IsRequired BIT NOT NULL DEFAULT 0,
    CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
    UpdatedAt DATETIME NOT NULL DEFAULT GETDATE(),
    FOREIGN KEY (ActionID) REFERENCES __mj.Action(ID)
);
EXEC sp_addextendedproperty @name = N'ms_description', @value = N'Tracks outputs, which are optional, from an action, including names, values, and descriptions.', @level0type = N'SCHEMA', @level0name = N'__mj', @level1type = N'TABLE', @level1name = N'ActionOutput';
EXEC sp_addextendedproperty @name = N'ms_description', @value = N'Name of the output variable the action will produce.', @level0type = N'SCHEMA', @level0name = N'__mj', @level1type = N'TABLE', @level1name = N'ActionOutput', @level2type = N'COLUMN', @level2name = N'Name';
EXEC sp_addextendedproperty @name = N'ms_description', @value = N'Default value of the output.', @level0type = N'SCHEMA', @level0name = N'__mj', @level1type = N'TABLE', @level1name = N'ActionOutput', @level2type = N'COLUMN', @level2name = N'DefaultValue';
EXEC sp_addextendedproperty @name = N'ms_description', @value = N'Description of the output.', @level0type = N'SCHEMA', @level0name = N'__mj', @level1type = N'TABLE', @level1name = N'ActionOutput', @level2type = N'COLUMN', @level2name = N'Description';



CREATE TABLE __mj.ActionContextType ( -- Lists possible contexts for action execution with optional descriptions.
    ID INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    Name NVARCHAR(255) NOT NULL, -- Name of the context type.
    Description NVARCHAR(MAX) NULL, -- Description of the context type.
    CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
    UpdatedAt DATETIME NOT NULL DEFAULT GETDATE()
);
EXEC sp_addextendedproperty @name = N'ms_description', @value = N'Lists possible contexts for action execution with optional descriptions.', @level0type = N'SCHEMA', @level0name = N'__mj', @level1type = N'TABLE', @level1name = N'ActionContextType';
EXEC sp_addextendedproperty @name = N'ms_description', @value = N'Name of the context type.', @level0type = N'SCHEMA', @level0name = N'__mj', @level1type = N'TABLE', @level1name = N'ActionContextType', @level2type = N'COLUMN', @level2name = N'Name';
EXEC sp_addextendedproperty @name = N'ms_description', @value = N'Description of the context type.', @level0type = N'SCHEMA', @level0name = N'__mj', @level1type = N'TABLE', @level1name = N'ActionContextType', @level2type = N'COLUMN', @level2name = N'Description';



CREATE TABLE __mj.ActionContext ( -- Links actions to their supported context types enabling a given action to be executable in more than one context.
    ID INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    ActionID INT NOT NULL,
    ContextTypeID INT NOT NULL,
    Status NVARCHAR(20) NOT NULL DEFAULT 'Pending' CHECK (Status IN ('Pending', 'Active', 'Disabled')), -- Status of the action context (Pending, Active, Disabled).
    CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
    UpdatedAt DATETIME NOT NULL DEFAULT GETDATE(),
    FOREIGN KEY (ActionID) REFERENCES __mj.Action(ID),
    FOREIGN KEY (ContextTypeID) REFERENCES __mj.ActionContextType(ID)
);
EXEC sp_addextendedproperty @name = N'ms_description', @value = N'Links actions to their supported context types enabling a given action to be executable in more than one context.', @level0type = N'SCHEMA', @level0name = N'__mj', @level1type = N'TABLE', @level1name = N'ActionContext';
EXEC sp_addextendedproperty @name = N'ms_description', @value = N'Status of the action context (Pending, Active, Disabled).', @level0type = N'SCHEMA', @level0name = N'__mj', @level1type = N'TABLE', @level1name = N'ActionContext', @level2type = N'COLUMN', @level2name = N'Status';




CREATE TABLE __mj.ActionFilter ( -- Defines filters that can be evaluated ahead of executing an action. Action Filters are usable in any code pipeline you can execute them with the same context as the action itself and use the outcome to determine if the action should execute or not.
    ID INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    UserDescription NVARCHAR(MAX) NOT NULL,
    UserComments NVARCHAR(MAX) NULL,
    Code NVARCHAR(MAX) NOT NULL,
    CodeExplanation NVARCHAR(MAX) NULL,
    CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
    UpdatedAt DATETIME NOT NULL DEFAULT GETDATE()
);
EXEC sp_addextendedproperty @name = N'ms_description', @value = N'Defines filters that can be evaluated ahead of executing an action. Action Filters are usable in any code pipeline you can execute them with the same context as the action itself and use the outcome to determine if the action should execute or not.', @level0type = N'SCHEMA', @level0name = N'__mj', @level1type = N'TABLE', @level1name = N'ActionFilter';



CREATE TABLE __mj.EntityAction ( -- Links entities to actions - this is the main place where you define the actions that part of, or available, for a given entity.
    ID INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    EntityID INT NOT NULL,
    ActionID INT NOT NULL,
    Status NVARCHAR(20) NOT NULL DEFAULT 'Pending' CHECK (Status IN ('Pending', 'Active', 'Disabled')), -- Status of the entity action (Pending, Active, Disabled).
    CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
    UpdatedAt DATETIME NOT NULL DEFAULT GETDATE(),
    FOREIGN KEY (EntityID) REFERENCES __mj.Entity(ID),
    FOREIGN KEY (ActionID) REFERENCES __mj.Action(ID)
);
EXEC sp_addextendedproperty @name = N'ms_description', @value = N'Links entities to actions - this is the main place where you define the actions that part of, or available, for a given entity.', @level0type = N'SCHEMA', @level0name = N'__mj', @level1type = N'TABLE', @level1name = N'EntityAction';
EXEC sp_addextendedproperty @name = N'ms_description', @value = N'Status of the entity action (Pending, Active, Disabled).', @level0type = N'SCHEMA', @level0name = N'__mj', @level1type = N'TABLE', @level1name = N'EntityAction', @level2type = N'COLUMN', @level2name = N'Status';



CREATE TABLE __mj.EntityActionFilter ( -- Optional use. Maps Action Filters to specific EntityAction instances, specifying execution order and status. This allows for “pre-processing” before an Action actually is fired off, to check for various state/dirty/value conditions.
    ID INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    EntityActionID INT NOT NULL,
    ActionFilterID INT NOT NULL,
    Sequence INT NOT NULL,
    Status NVARCHAR(20) NOT NULL DEFAULT 'Pending' CHECK (Status IN ('Pending', 'Active', 'Disabled')), -- Status of the entity action filter (Pending, Active, Disabled).
    CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
    UpdatedAt DATETIME NOT NULL DEFAULT GETDATE(),
    FOREIGN KEY (EntityActionID) REFERENCES __mj.EntityAction(ID),
    FOREIGN KEY (ActionFilterID) REFERENCES __mj.ActionFilter(ID)
);
EXEC sp_addextendedproperty @name = N'ms_description', @value = N'Optional use. Maps Action Filters to specific EntityAction instances, specifying execution order and status. This allows for “pre-processing” before an Action actually is fired off, to check for various state/dirty/value conditions.', @level0type = N'SCHEMA', @level0name = N'__mj', @level1type = N'TABLE', @level1name = N'EntityActionFilter';
EXEC sp_addextendedproperty @name = N'ms_description', @value = N'Order of filter execution.', @level0type = N'SCHEMA', @level0name = N'__mj', @level1type = N'TABLE', @level1name = N'EntityActionFilter', @level2type = N'COLUMN', @level2name = N'Sequence';
EXEC sp_addextendedproperty @name = N'ms_description', @value = N'Status of the entity action filter (Pending, Active, Disabled).', @level0type = N'SCHEMA', @level0name = N'__mj', @level1type = N'TABLE', @level1name = N'EntityActionFilter', @level2type = N'COLUMN', @level2name = N'Status';




CREATE TABLE __mj.EntityActionInvocationType ( -- Stores the possible invocation types of an action within the context of an entity. Examples would be: Record Created/Updated/Deleted/Accessed as well as things like “View” or “List” where you could run an EntityAction against an entire set of records in a view or list – either by user click or programmatically.
    ID INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    Name NVARCHAR(255) NOT NULL, -- Name of the invocation type such as Record Created/Updated/etc
    Description NVARCHAR(MAX), -- Description of the invocation type.
    CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
    UpdatedAt DATETIME NOT NULL DEFAULT GETDATE()
);
EXEC sp_addextendedproperty @name = N'ms_description', @value = N'Stores the possible invocation types of an action within the context of an entity. Examples would be: Record Created/Updated/Deleted/Accessed as well as things like “View” or “List” where you could run an EntityAction against an entire set of records in a view or list – either by user click or programmatically.', @level0type = N'SCHEMA', @level0name = N'__mj', @level1type = N'TABLE', @level1name = N'EntityActionInvocationType';
EXEC sp_addextendedproperty @name = N'ms_description', @value = N'Name of the invocation type such as Record Created/Updated/etc.', @level0type = N'SCHEMA', @level0name = N'__mj', @level1type = N'TABLE', @level1name = N'EntityActionInvocationType', @level2type = N'COLUMN', @level2name = N'Name';
EXEC sp_addextendedproperty @name = N'ms_description', @value = N'Description of the invocation type.', @level0type = N'SCHEMA', @level0name = N'__mj', @level1type = N'TABLE', @level1name = N'EntityActionInvocationType', @level2type = N'COLUMN', @level2name = N'Description';



CREATE TABLE __mj.EntityActionInvocation ( -- Links invocation types to entity actions – for example you might link a particular EntityAction to just “Create Record” and you might also have a second item in this table allowing the same Entity Action to be invoked from a User View or List, on demand.
    ID INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    EntityActionID INT NOT NULL,
    InvocationTypeID INT NOT NULL,
    Status NVARCHAR(20) NOT NULL DEFAULT 'Pending' CHECK (Status IN ('Pending', 'Active', 'Disabled')), -- Status of the entity action invocation (Pending, Active, Disabled).
    CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
    UpdatedAt DATETIME NOT NULL DEFAULT GETDATE(),
    FOREIGN KEY (EntityActionID) REFERENCES __mj.EntityAction(ID),
    FOREIGN KEY (InvocationTypeID) REFERENCES __mj.EntityActionInvocationType(ID)
);
EXEC sp_addextendedproperty @name = N'ms_description', @value = N'Links invocation types to entity actions – for example you might link a particular EntityAction to just “Create Record” and you might also have a second item in this table allowing the same Entity Action to be invoked from a User View or List, on demand.', @level0type = N'SCHEMA', @level0name = N'__mj', @level1type = N'TABLE', @level1name = N'EntityActionInvocation';
EXEC sp_addextendedproperty @name = N'ms_description', @value = N'Status of the entity action invocation (Pending, Active, Disabled).', @level0type = N'SCHEMA', @level0name = N'__mj', @level1type = N'TABLE', @level1name = N'EntityActionInvocation', @level2type = N'COLUMN', @level2name = N'Status';




CREATE TABLE __mj.ActionExecutionLog ( -- Tracks every execution of an action, including start and end times, inputs, outputs, and result codes.
    ID INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    ActionID INT NOT NULL,
    StartedAt DATETIME NOT NULL DEFAULT GETDATE(), -- Timestamp of when the action started execution.
    EndedAt DATETIME NULL, -- Timestamp of when the action ended execution.
    Inputs NVARCHAR(MAX),
    Outputs NVARCHAR(MAX),
    ResultCode NVARCHAR(255),
    UserID INT NOT NULL,
    RetentionPeriod INT, -- Number of days to retain the log; NULL for indefinite retention.
    CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
    UpdatedAt DATETIME NOT NULL DEFAULT GETDATE(),
    FOREIGN KEY (ActionID) REFERENCES __mj.Action(ID),
    FOREIGN KEY (UserID) REFERENCES __mj.[User](ID)
);
EXEC sp_addextendedproperty @name = N'ms_description', @value = N'Tracks every execution of an action, including start and end times, inputs, outputs, and result codes.', @level0type = N'SCHEMA', @level0name = N'__mj', @level1type = N'TABLE', @level1name = N'ActionExecutionLog';
EXEC sp_addextendedproperty @name = N'ms_description', @value = N'Timestamp of when the action started execution.', @level0type = N'SCHEMA', @level0name = N'__mj', @level1type = N'TABLE', @level1name = N'ActionExecutionLog', @level2type = N'COLUMN', @level2name = N'StartedAt';
EXEC sp_addextendedproperty @name = N'ms_description', @value = N'Timestamp of when the action ended execution.', @level0type = N'SCHEMA', @level0name = N'__mj', @level1type = N'TABLE', @level1name = N'ActionExecutionLog', @level2type = N'COLUMN', @level2name = N'EndedAt';
EXEC sp_addextendedproperty @name = N'ms_description', @value = N'Number of days to retain the log; NULL for indefinite retention.', @level0type = N'SCHEMA', @level0name = N'__mj', @level1type = N'TABLE', @level1name = N'ActionExecutionLog', @level2type = N'COLUMN', @level2name = N'RetentionPeriod';




CREATE TABLE __mj.ActionResultCode ( -- Defines the possible result codes for each action.
    ID INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    ActionID INT NOT NULL,
    ResultCode NVARCHAR(255) NOT NULL,
    Description NVARCHAR(MAX), -- Description of the result code.
    CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
    UpdatedAt DATETIME NOT NULL DEFAULT GETDATE(),
    FOREIGN KEY (ActionID) REFERENCES __mj.Action(ID)
);
EXEC sp_addextendedproperty @name = N'ms_description', @value = N'Defines the possible result codes for each action.', @level0type = N'SCHEMA', @level0name = N'__mj', @level1type = N'TABLE', @level1name = N'ActionResultCode';
EXEC sp_addextendedproperty @name = N'ms_description', @value = N'Description of the result code.', @level0type = N'SCHEMA', @level0name = N'__mj', @level1type = N'TABLE', @level1name = N'ActionResultCode', @level2type = N'COLUMN', @level2name = N'Description';

 