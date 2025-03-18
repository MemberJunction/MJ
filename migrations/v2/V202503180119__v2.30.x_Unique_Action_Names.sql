-- Prevent Actions from having the same name
ALTER TABLE [${flyway:defaultSchema}].[Action]
ADD UNIQUE(Name);

-- prevent Action Params from having the same name for a given Action
ALTER TABLE [${flyway:defaultSchema}].[ActionParam]
ADD UNIQUE(Name, ActionID);

 -- prevent an action param from having multiple scheduled action params tied to it 
ALTER TABLE [${flyway:defaultSchema}].[ScheduledActionParam]
ADD UNIQUE(ScheduledActionID, ActionParamID);