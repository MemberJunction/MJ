import { LoadDashboardResource } from "./dashboard-resource.component";
import { LoadListDetailResource } from "./list-detail-resource.component";
import { LoadQueryResource } from "./query-resource.component";
import { LoadRecordResource } from "./record-resource.component";
import { LoadReportResource } from "./report-resource.component";
import { LoadSearchResultsResource } from "./search-results-resource.component";
import { LoadViewResource } from "./view-resource.component";
import { LoadChatConversationsResource } from "./chat-conversations-resource.component";
import { LoadChatCollectionsResource } from "./chat-collections-resource.component";
import { LoadChatTasksResource } from "./chat-tasks-resource.component";
import { LoadAIMonitorResource } from "./ai-monitor-resource.component";
import { LoadAIPromptsResource } from "./ai-prompts-resource.component";
import { LoadAIAgentsResource } from "./ai-agents-resource.component";
import { LoadAIModelsResource } from "./ai-models-resource.component";
import { LoadAIConfigResource } from "./ai-config-resource.component";
import { LoadArtifactResource } from "./artifact-resource.component";

export function LoadResourceWrappers()
{
    LoadViewResource();
    LoadReportResource();
    LoadDashboardResource();
    LoadRecordResource();
    LoadSearchResultsResource();
    LoadQueryResource();
    LoadListDetailResource();
    LoadChatConversationsResource();
    LoadChatCollectionsResource();
    LoadChatTasksResource();
    LoadAIMonitorResource();
    LoadAIPromptsResource();
    LoadAIAgentsResource();
    LoadAIModelsResource();
    LoadAIConfigResource();
    LoadArtifactResource();
}