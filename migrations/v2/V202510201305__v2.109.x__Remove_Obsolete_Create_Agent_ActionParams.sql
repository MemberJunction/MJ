/**
  Remove obsolete Action Params from the 'Create Agent' action that are no longer needed
  after refactoring to use AgentSpec interface.

  The Create Agent action was updated to accept a single AgentSpec object parameter instead
  of multiple individual parameters (Name, Description, TypeID, Type, ParentID, PromptText).

  This migration removes the 3 obsolete input parameters that have been replaced:
  - Description (DE7AE66F-604E-4BC3-94F7-2107F2AA8CC7)
  - TypeID (E44F54E6-69B3-4892-AF6D-28373DB52C7C)
  - Type (56BA11F2-D42F-4528-8F97-9FAC67CE8C28)

  The following parameters remain and were repurposed:
  - Name → AgentSpec (F4DF50F1-B5B2-4F76-9787-02C01BAB5B75)
  - ParentID → SubAgentIDs (B66CF581-7DAD-4E97-B33C-543DF167DCF3)
  - PromptText → SubAgentErrors (486E6A9C-94D1-4F2C-A20C-CC75A3630F49)
  - AgentID output (C5269575-D999-4EEC-8CAD-2339E0D9E82C) - unchanged
  - PromptID output (6C8D279E-C833-40F7-BB9C-12A52AA93F4C) - unchanged
**/

DELETE FROM ${flyway:defaultSchema}.ActionParam
WHERE ID IN (
  'DE7AE66F-604E-4BC3-94F7-2107F2AA8CC7',  -- Description input (obsolete)
  'E44F54E6-69B3-4892-AF6D-28373DB52C7C',  -- TypeID input (obsolete)
  '56BA11F2-D42F-4528-8F97-9FAC67CE8C28'   -- Type input (obsolete)
);
