/*
Prevent Actions from having the same name
If you have two distinct actions with the same name, 
there's nothing to ensure the intended action gets executed at runtime. 
Because we pass in the action entity's name into the class factory function 
to instantiate the action class.  
*/
ALTER TABLE [${flyway:defaultSchema}].[Action]
ADD UNIQUE(Name);

/*
prevent Action Params from having the same name for a given Action
Similarly with action params, whenever we attempt to look for a parameter, 
we usually tend to look for them by name. Its possible for two params with different 
value types to share the same name, resulting in different, outcomes of the action
the user may not intended
*/
ALTER TABLE [${flyway:defaultSchema}].[ActionParam]
ADD UNIQUE(Name, ActionID);

/*
Prevent an action param from having multiple scheduled action params tied to it 
If multiple scheduled action params are defined for a single action param, it may not be 
clear which scheduled aciton param gets selected at run time to execute a scheduled action.
The scheduled action params may have different values which could affect the outcome of the
scheduled action. 
*/
ALTER TABLE [${flyway:defaultSchema}].[ScheduledActionParam]
ADD UNIQUE(ScheduledActionID, ActionParamID);
