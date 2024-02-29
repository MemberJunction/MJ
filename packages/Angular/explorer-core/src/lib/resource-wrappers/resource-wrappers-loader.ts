import { LoadDashboardResource } from "./dashboard-resource.component";
import { LoadQueryResource } from "./query-resource.component";
import { LoadRecordResource } from "./record-resource.component";
import { LoadReportResource } from "./report-resource.component";
import { LoadSearchResultsResource } from "./search-results-resource.component";
import { LoadViewResource } from "./view-resource.component";

export function LoadResourceWrappers()
{
    LoadViewResource();
    LoadReportResource();
    LoadDashboardResource();
    LoadRecordResource();
    LoadSearchResultsResource();
    LoadQueryResource();
}