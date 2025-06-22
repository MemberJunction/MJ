
  Create a new dashboard record using the Create Record parent action. You will be creating a record in the "Dashboards"
  entity with the following available fields:
    
  Required Fields:  
  - Name (string, max 255 chars) - The display name of the dashboard 
  - UserID (UUID) - The ID of the user who owns this dashboard
  - UIConfigDetails (string/JSON) - The configuration details for the dashboard UI components
   
  Optional Fields:
  - Description (string, unlimited) - Detailed description of the dashboard's purpose
  - CategoryID (UUID) - References a Dashboard Category for organization
  - Type (enum) - Dashboard type: "Config" (default, metadata-driven), "Code" (compiled TypeScript), or "Dynamic Code"
  (Skip-generated runtime)   
  - Thumbnail (string) - Base64 encoded image or URL for the dashboard thumbnail
  - Scope (enum) - "Global" (default, available to all) or "App" (specific to an application)
  - ApplicationID (UUID) - Required if Scope is "App", links to the specific Application
  - DriverClass (string, max 255 chars) - Required if Type is "Code", specifies the runtime class
  - Code (string, max 255 chars) - Identifier for code-based dashboards, allows reuse of DriverClass

  Example Use Cases:
  - Create a global analytics dashboard with custom charts and widgets
  - Create an app-specific dashboard for monitoring user activity
  - Create a code-based dashboard with custom TypeScript implementation

  Notes:
  - ID is auto-generated (do not provide)
  - System fields (__mj_CreatedAt, __mj_UpdatedAt) are auto-managed
  - Ensure CategoryID references a valid Dashboard Category if provided
  - If Scope is "App", ApplicationID must be provided