/**
 * Explicit subclass rename mappings for the v5.0 entity subclass naming convention.
 * These entries take priority over auto-generated suffix rules in buildClassRenameRules().
 *
 * Categories:
 *   - full-stack-extended: {Name}EntityExtended → MJ{Name}EntityExtended
 *   - server-only: various old suffixes → MJ{Name}EntityServer
 *   - angular-form: {Name}FormComponentExtended → MJ{Name}FormComponentExtended
 *   - angular-form-anomaly: anomalous naming that doesn't follow any suffix pattern
 */
/** Category of a subclass rename entry. */
export type SubclassRenameCategory =
    | 'full-stack-extended'
    | 'server-only'
    | 'angular-form'
    | 'angular-form-anomaly';

export interface SubclassRenameEntry {
    oldClassName: string;
    newClassName: string;
    category: SubclassRenameCategory;
    entityName: string;
}

export const SUBCLASS_RENAME_MAP: SubclassRenameEntry[] = [
    {
        oldClassName: "ScheduledActionEntityExtended",
        newClassName: "MJScheduledActionEntityExtended",
        category: "full-stack-extended",
        entityName: "MJ: Scheduled Actions"
    },
    {
        oldClassName: "EntityFieldEntityExtended",
        newClassName: "MJEntityFieldEntityExtended",
        category: "full-stack-extended",
        entityName: "MJ: Entity Fields"
    },
    {
        oldClassName: "EntityEntityExtended",
        newClassName: "MJEntityEntityExtended",
        category: "full-stack-extended",
        entityName: "MJ: Entities"
    },
    {
        oldClassName: "ComponentEntityExtended",
        newClassName: "MJComponentEntityExtended",
        category: "full-stack-extended",
        entityName: "MJ: Components"
    },
    {
        oldClassName: "UserViewEntityExtended",
        newClassName: "MJUserViewEntityExtended",
        category: "full-stack-extended",
        entityName: "MJ: User Views"
    },
    {
        oldClassName: "ListDetailEntityExtended",
        newClassName: "MJListDetailEntityExtended",
        category: "full-stack-extended",
        entityName: "MJ: List Details"
    },
    {
        oldClassName: "ResourcePermissionEntityExtended",
        newClassName: "MJResourcePermissionEntityExtended",
        category: "full-stack-extended",
        entityName: "MJ: Resource Permissions"
    },
    {
        oldClassName: "EnvironmentEntityExtended",
        newClassName: "MJEnvironmentEntityExtended",
        category: "full-stack-extended",
        entityName: "MJ: Environments"
    },
    {
        oldClassName: "DashboardEntityExtended",
        newClassName: "MJDashboardEntityExtended",
        category: "full-stack-extended",
        entityName: "MJ: Dashboards"
    },
    {
        oldClassName: "TemplateEntityExtended",
        newClassName: "MJTemplateEntityExtended",
        category: "full-stack-extended",
        entityName: "MJ: Templates"
    },
    {
        oldClassName: "AIAgentRunEntityExtended",
        newClassName: "MJAIAgentRunEntityExtended",
        category: "full-stack-extended",
        entityName: "MJ: AI Agent Runs"
    },
    {
        oldClassName: "AIPromptCategoryEntityExtended",
        newClassName: "MJAIPromptCategoryEntityExtended",
        category: "full-stack-extended",
        entityName: "MJ: AI Prompt Categories"
    },
    {
        oldClassName: "AIAgentRunStepEntityExtended",
        newClassName: "MJAIAgentRunStepEntityExtended",
        category: "full-stack-extended",
        entityName: "MJ: AI Agent Run Steps"
    },
    {
        oldClassName: "AIAgentEntityExtended",
        newClassName: "MJAIAgentEntityExtended",
        category: "full-stack-extended",
        entityName: "MJ: AI Agents"
    },
    {
        oldClassName: "AIPromptEntityExtended",
        newClassName: "MJAIPromptEntityExtended",
        category: "full-stack-extended",
        entityName: "MJ: AI Prompts"
    },
    {
        oldClassName: "AIPromptRunEntityExtended",
        newClassName: "MJAIPromptRunEntityExtended",
        category: "full-stack-extended",
        entityName: "MJ: AI Prompt Runs"
    },
    {
        oldClassName: "AIModelEntityExtended",
        newClassName: "MJAIModelEntityExtended",
        category: "full-stack-extended",
        entityName: "MJ: AI Models"
    },
    {
        oldClassName: "AICredentialBindingEntityExtended",
        newClassName: "MJAICredentialBindingEntityExtended",
        category: "full-stack-extended",
        entityName: "MJ: AI Credential Bindings"
    },
    {
        oldClassName: "ActionEntityExtended",
        newClassName: "MJActionEntityExtended",
        category: "full-stack-extended",
        entityName: "MJ: Actions"
    },
    {
        oldClassName: "EntityActionEntityExtended",
        newClassName: "MJEntityActionEntityExtended",
        category: "full-stack-extended",
        entityName: "MJ: Entity Actions"
    },
    {
        oldClassName: "EntityCommunicationMessageTypeExtended",
        newClassName: "MJEntityCommunicationMessageTypeEntityExtended",
        category: "full-stack-extended",
        entityName: "MJ: Entity Communication Message Types"
    },
    {
        oldClassName: "LibraryItemEntityExtended",
        newClassName: "MJLibraryItemEntityExtended",
        category: "full-stack-extended",
        entityName: "MJ: Library Items"
    },
    {
        oldClassName: "LibraryEntityExtended",
        newClassName: "MJLibraryEntityExtended",
        category: "full-stack-extended",
        entityName: "MJ: Libraries"
    },
    {
        oldClassName: "ScheduledJobEntityExtended",
        newClassName: "MJScheduledJobEntityExtended",
        category: "full-stack-extended",
        entityName: "MJ: Scheduled Jobs"
    },
    {
        oldClassName: "CommunicationProviderEntityExtended",
        newClassName: "MJCommunicationProviderEntityExtended",
        category: "full-stack-extended",
        entityName: "MJ: Communication Providers"
    },
    {
        oldClassName: "ReportEntity_Server",
        newClassName: "MJReportEntityServer",
        category: "server-only",
        entityName: "MJ: Reports"
    },
    {
        oldClassName: "AIAgentExampleEntityExtended",
        newClassName: "MJAIAgentExampleEntityServer",
        category: "server-only",
        entityName: "MJ: AI Agent Examples"
    },
    {
        oldClassName: "ArtifactVersionExtended",
        newClassName: "MJArtifactVersionEntityServer",
        category: "server-only",
        entityName: "MJ: Artifact Versions"
    },
    {
        oldClassName: "AIPromptRunEntityServer",
        newClassName: "MJAIPromptRunEntityServer",
        category: "server-only",
        entityName: "MJ: AI Prompt Runs"
    },
    {
        oldClassName: "AIPromptEntityExtendedServer",
        newClassName: "MJAIPromptEntityServer",
        category: "server-only",
        entityName: "MJ: AI Prompts"
    },
    {
        oldClassName: "ConversationDetailEntityServer",
        newClassName: "MJConversationDetailEntityServer",
        category: "server-only",
        entityName: "MJ: Conversation Details"
    },
    {
        oldClassName: "DuplicateRunEntity_Server",
        newClassName: "MJDuplicateRunEntityServer",
        category: "server-only",
        entityName: "MJ: Duplicate Runs"
    },
    {
        oldClassName: "QueryEntityExtended",
        newClassName: "MJQueryEntityServer",
        category: "server-only",
        entityName: "MJ: Queries"
    },
    {
        oldClassName: "UserViewEntity_Server",
        newClassName: "MJUserViewEntityServer",
        category: "server-only",
        entityName: "MJ: User Views"
    },
    {
        oldClassName: "AIAgentNoteEntityExtended",
        newClassName: "MJAIAgentNoteEntityServer",
        category: "server-only",
        entityName: "MJ: AI Agent Notes"
    },
    {
        oldClassName: "TemplateContentEntityExtended",
        newClassName: "MJTemplateContentEntityServer",
        category: "server-only",
        entityName: "MJ: Template Contents"
    },
    {
        oldClassName: "ApplicationEntityServerEntity",
        newClassName: "MJApplicationEntityServer",
        category: "server-only",
        entityName: "MJ: Applications"
    },
    {
        oldClassName: "ActionEntityServerEntity",
        newClassName: "MJActionEntityServer",
        category: "server-only",
        entityName: "MJ: Actions"
    },
    {
        oldClassName: "ComponentEntityExtended_Server",
        newClassName: "MJComponentEntityServer",
        category: "server-only",
        entityName: "MJ: Components"
    },
    {
        oldClassName: "EntityPermissionsEntity_Server",
        newClassName: "MJEntityPermissionEntityServer",
        category: "server-only",
        entityName: "MJ: Entity Permissions"
    },
    {
        oldClassName: "AIAgentFormComponentExtended",
        newClassName: "MJAIAgentFormComponentExtended",
        category: "angular-form",
        entityName: "MJ: AI Agents"
    },
    {
        oldClassName: "AIPromptFormComponentExtended",
        newClassName: "MJAIPromptFormComponentExtended",
        category: "angular-form",
        entityName: "MJ: AI Prompts"
    },
    {
        oldClassName: "AIPromptRunFormComponentExtended",
        newClassName: "MJAIPromptRunFormComponentExtended",
        category: "angular-form",
        entityName: "MJ: AI Prompt Runs"
    },
    {
        oldClassName: "AIAgentRunFormComponentExtended",
        newClassName: "MJAIAgentRunFormComponentExtended",
        category: "angular-form",
        entityName: "MJ: AI Agent Runs"
    },
    {
        oldClassName: "EntityFormComponentExtended",
        newClassName: "MJEntityFormComponentExtended",
        category: "angular-form",
        entityName: "MJ: Entities"
    },
    {
        oldClassName: "ActionFormComponentExtended",
        newClassName: "MJActionFormComponentExtended",
        category: "angular-form",
        entityName: "MJ: Actions"
    },
    {
        oldClassName: "ActionExecutionLogFormComponentExtended",
        newClassName: "MJActionExecutionLogFormComponentExtended",
        category: "angular-form",
        entityName: "MJ: Action Execution Logs"
    },
    {
        oldClassName: "ListFormComponentExtended",
        newClassName: "MJListFormComponentExtended",
        category: "angular-form",
        entityName: "MJ: Lists"
    },
    {
        oldClassName: "TestFormComponentExtended",
        newClassName: "MJTestFormComponentExtended",
        category: "angular-form",
        entityName: "MJ: Tests"
    },
    {
        oldClassName: "TestRunFormComponentExtended",
        newClassName: "MJTestRunFormComponentExtended",
        category: "angular-form",
        entityName: "MJ: Test Runs"
    },
    {
        oldClassName: "TestSuiteFormComponentExtended",
        newClassName: "MJTestSuiteFormComponentExtended",
        category: "angular-form",
        entityName: "MJ: Test Suites"
    },
    {
        oldClassName: "TestSuiteRunFormComponentExtended",
        newClassName: "MJTestSuiteRunFormComponentExtended",
        category: "angular-form",
        entityName: "MJ: Test Suite Runs"
    },
    {
        oldClassName: "TestRunFeedbackFormComponentExtended",
        newClassName: "MJTestRunFeedbackFormComponentExtended",
        category: "angular-form",
        entityName: "MJ: Test Run Feedbacks"
    },
    {
        oldClassName: "TestRubricFormComponentExtended",
        newClassName: "MJTestRubricFormComponentExtended",
        category: "angular-form",
        entityName: "MJ: Test Rubrics"
    },
    {
        oldClassName: "QueryFormExtendedComponent",
        newClassName: "MJQueryFormComponentExtended",
        category: "angular-form-anomaly",
        entityName: "MJ: Queries"
    },
    {
        oldClassName: "TemplatesFormExtendedComponent",
        newClassName: "MJTemplateFormComponentExtended",
        category: "angular-form-anomaly",
        entityName: "MJ: Templates"
    },
    {
        oldClassName: "EntityActionExtendedFormComponent",
        newClassName: "MJEntityActionFormComponentExtended",
        category: "angular-form-anomaly",
        entityName: "MJ: Entity Actions"
    }
];
