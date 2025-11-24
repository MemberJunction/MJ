import { Injectable } from '@angular/core';
import { Subject, Observable } from 'rxjs';
import { TabRequest } from './interfaces/tab-request.interface';

/**
 * Service for requesting tabs to be opened.
 *
 * This service provides a way for any component in the app to request
 * that a new tab be opened without needing direct access to the
 * WorkspaceStateManager.
 *
 * Tab requests are queued and can be replayed when subscribers connect.
 * This ensures requests aren't lost if they arrive before the shell is ready.
 */
@Injectable({
  providedIn: 'root'
})
export class TabService {
  private tabRequest$ = new Subject<TabRequest>();
  private queuedRequests: TabRequest[] = [];

  /**
   * Observable of tab open requests
   */
  get TabRequests(): Observable<TabRequest> {
    return this.tabRequest$.asObservable();
  }

  /**
   * Request that a new tab be opened
   */
  OpenTab(request: TabRequest): void {
    console.log('[TabService.OpenTab] Tab request queued:', {
      appId: request.ApplicationId,
      title: request.Title,
      config: request.Configuration
    });

    // Store in queue for replay
    this.queuedRequests.push(request);
    console.log('[TabService.OpenTab] Queue size:', this.queuedRequests.length);

    // Emit to current subscribers
    this.tabRequest$.next(request);
  }

  /**
   * Get all queued tab requests (for replay on subscription)
   */
  GetQueuedRequests(): TabRequest[] {
    console.log('[TabService.GetQueuedRequests] Returning', this.queuedRequests.length, 'queued requests');
    return [...this.queuedRequests];
  }

  /**
   * Clear the queue after requests have been processed
   */
  ClearQueue(): void {
    console.log('[TabService.ClearQueue] Clearing', this.queuedRequests.length, 'processed requests');
    this.queuedRequests = [];
  }

  /**
   * Helper method to open a record in a tab
   */
  OpenRecord(entityName: string, recordId: string, applicationId: string): void {
    this.OpenTab({
      ApplicationId: applicationId,
      Title: `${entityName}`,
      Route: `/record/${entityName}/${recordId}`,
      Configuration: {
        resourceType: 'record',
        entityName,
        recordId
      }
    });
  }

  /**
   * Helper method to open a view in a tab
   */
  OpenView(viewId: string, viewName: string, applicationId: string): void {
    this.OpenTab({
      ApplicationId: applicationId,
      Title: viewName,
      Route: `/view/${viewId}`,
      Configuration: {
        resourceType: 'view',
        viewId
      }
    });
  }

  /**
   * Helper method to open a dashboard in a tab
   */
  OpenDashboard(dashboardId: string, dashboardName: string, applicationId: string): void {
    this.OpenTab({
      ApplicationId: applicationId,
      Title: dashboardName,
      Route: `/dashboard/${dashboardId}`,
      Configuration: {
        resourceType: 'dashboard',
        dashboardId
      }
    });
  }

  /**
   * Helper method to open a report in a tab
   */
  OpenReport(reportId: string, reportName: string, applicationId: string): void {
    this.OpenTab({
      ApplicationId: applicationId,
      Title: reportName,
      Route: `/report/${reportId}`,
      Configuration: {
        resourceType: 'report',
        reportId
      }
    });
  }

  /**
   * Helper method to open a query in a tab
   */
  OpenQuery(queryId: string, queryName: string, applicationId: string): void {
    this.OpenTab({
      ApplicationId: applicationId,
      Title: queryName,
      Route: `/query/${queryId}`,
      Configuration: {
        resourceType: 'query',
        queryId
      }
    });
  }
}
