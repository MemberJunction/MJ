import { Component, OnInit, OnDestroy, ViewChild, inject } from '@angular/core';
import { Subject, Subscription } from 'rxjs';
import { BaseEntity, BaseEntityEvent, CompositeKey, LogError, Metadata, ResolveEntityEventRow } from '@memberjunction/core';
import { MJAIAgentRunEntityExtended, MJAIAgentEntityExtended } from '@memberjunction/ai-core-plus';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { MJGlobal, MJEvent, MJEventType, RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { SharedService, NavigationService } from '@memberjunction/ng-shared';
import { TimelineItem, AIAgentRunTimelineComponent } from './ai-agent-run-timeline.component';
import { MJAIAgentRunFormComponent } from '../../generated/Entities/MJAIAgentRun/mjaiagentrun.form.component';
import { ParseJSONRecursive, ParseJSONOptions } from '@memberjunction/global';
import { AIAgentRunAnalyticsComponent } from './ai-agent-run-analytics.component';
import { AIAgentRunCostService, AgentRunCostMetrics } from './ai-agent-run-cost.service';
import { AIAgentRunDataHelper } from './ai-agent-run-data.service';
import { ApplicationManager } from '@memberjunction/ng-base-application';

@RegisterClass(BaseFormComponent, 'MJ: AI Agent Runs') 
@Component({
  standalone: false,
  selector: 'mj-ai-agent-run-form',
  templateUrl: './ai-agent-run.component.html',
  styleUrls: ['./ai-agent-run.component.css']
})
export class MJAIAgentRunFormComponentExtended extends MJAIAgentRunFormComponent implements OnInit, OnDestroy {
  public record!: MJAIAgentRunEntityExtended;
  
  private destroy$ = new Subject<void>();

  // MJGlobal BaseEntity event subscription — fires on both local Save()
  // and server-side remote-invalidate events. While the run is Running,
  // this is how we hear about new steps and status changes without
  // polling the DB on a timer. Only attached when Status === 'Running'.
  private entityEventSubscription: Subscription | null = null;
  private refreshInFlight = false;

  // UI state
  activeTab = 'timeline';
  selectedTimelineItem: TimelineItem | null = null;
  jsonPanelExpanded = false;
  loading = false;
  error: string | null = null;
  analyticsLoaded = false;
  visualizationLoaded = false;
  
  agent: MJAIAgentEntityExtended | null = null;
  
  // Cost metrics using shared service
  costMetrics: AgentRunCostMetrics | null = null;
  
  // Cached parsed results to prevent redundant JSON parsing
  private _cachedParsedResult: string | null = null;
  private _cachedParsedStartingPayload: string | null = null;
  private _cachedParsedFinalPayload: string | null = null;
  private _cachedParsedData: string | null = null;
  
  // Simple parsing state - true when all parsing is complete
  private _allParsingComplete = false;
  
  @ViewChild(AIAgentRunTimelineComponent) timelineComponent?: AIAgentRunTimelineComponent;
  @ViewChild(AIAgentRunAnalyticsComponent) analyticsComponent?: AIAgentRunAnalyticsComponent;

  // Field injections
  private navigationService = inject(NavigationService);
  private costService = inject(AIAgentRunCostService);
  private appManager = inject(ApplicationManager);

  // Instance of data helper per component
  public dataHelper = new AIAgentRunDataHelper();
  
  async ngOnInit() {
    await super.ngOnInit();
    
    if (this.record && this.record.ID) {
      await this.dataHelper.loadAgentRunData(this.record.ID);
      await this.loadAgent();
      await this.loadCostMetrics();

      // Parse all JSON fields on form load for instant access later
      this.parseAllFields();

      // If the run is in progress, subscribe to BaseEntity events so we
      // pick up new steps / status changes the moment AgentRunner saves
      // them — no 30s polling timer. Same pattern used by the Form
      // Builder cockpit. See `handleEntityEvent` below for filtering.
      if (this.record.Status === 'Running') {
        this.subscribeToRunEvents();
      }
    }
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    this.entityEventSubscription?.unsubscribe();
    this.entityEventSubscription = null;
    this.clearParsedCache();
    this.dataHelper.clearData();
    this.costMetrics = null;
    this.agent = null;
  }

  private subscribeToRunEvents(): void {
    if (this.entityEventSubscription) return;
    this.entityEventSubscription = MJGlobal.Instance.GetEventListener(false)
      .subscribe(mjEvent => this.handleEntityEvent(mjEvent));
  }

  private unsubscribeFromRunEvents(): void {
    this.entityEventSubscription?.unsubscribe();
    this.entityEventSubscription = null;
  }

  /**
   * Filter the global BaseEntity event firehose down to saves on the
   * current Agent Run row, its Steps, or its Prompt Runs — and only when
   * AgentRunID matches `this.record.ID`. Local `save` events come from
   * the in-process AgentRunner (dev/same-tab case, which is the primary
   * use case here); `remote-invalidate` covers writes from a separate
   * server process if GraphQL cache-invalidation is wired up.
   */
  /**
   * Fire-and-forget: nothing consumes the return, which is what lets this be async. It has to be,
   * because a remote event no longer carries the row unless the deployment allowlisted the entity
   * — the fields below come from a keyed re-read instead (see `ResolveEntityEventRow`).
   *
   * Because the subscriber in `subscribeToRunEvents` drops the promise, a throw here would surface
   * as an unhandled rejection; the body is wrapped so it is logged instead, the same way
   * `FormBuilderResourceComponent.handleEntityEvent` handles it.
   */
  private async handleEntityEvent(mjEvent: MJEvent): Promise<void> {
    try {
      await this.handleEntityEventUnguarded(mjEvent);
    } catch (err) {
      LogError(`AIAgentRunForm.handleEntityEvent: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async handleEntityEventUnguarded(mjEvent: MJEvent): Promise<void> {
    if (mjEvent.event !== MJEventType.ComponentEvent) return;
    if (mjEvent.eventCode !== BaseEntity.BaseEventCode) return;
    const evt = mjEvent.args as BaseEntityEvent | undefined;
    if (!evt) return;
    if (evt.type !== 'save' && evt.type !== 'remote-invalidate') return;

    const entityName = evt.entityName ?? evt.baseEntity?.EntityInfo?.Name;
    if (!entityName) return;

    const runId = this.record?.ID;
    if (!runId) return;

    if (entityName === 'MJ: AI Agent Runs') {
      // Status change on THIS run row.
      const savedID = this.resolveEventID(evt);
      if (savedID && UUIDsEqual(savedID, runId)) {
        this.refreshData();
        // If the run completed, drop the subscription — no further
        // writes are expected and we don't want to hold the listener.
        // Resolved only once the id has matched, so an unrelated run's event costs no read.
        const row = await this.resolveEventRow(evt);
        const newStatus = row?.['Status'] as string | undefined;
        if (newStatus && newStatus !== 'Running') {
          this.unsubscribeFromRunEvents();
        }
      }
      return;
    }

    // Steps still carry AgentRunID, so a step write can be correlated exactly to this run. Unlike
    // `Status` above, this read is NOT behind an id match — it cannot be, because AgentRunID is a
    // foreign key on the step and there is nothing to compare until the row is in hand. So while
    // this form is open on a Running agent, every step save anywhere in the deployment costs it
    // one keyed read (or nothing, if the entity is allowlisted for broadcast). It is bounded by
    // the run's lifetime: `unsubscribeFromRunEvents()` fires once the run leaves 'Running'.
    if (entityName === 'MJ: AI Agent Run Steps') {
      const childAgentRunId = (await this.resolveEventRow(evt))?.['AgentRunID'] as string | undefined;
      if (childAgentRunId && UUIDsEqual(childAgentRunId, runId)) {
        this.refreshRunDataDebounced();
      }
      return;
    }

    // Prompt runs and action logs expose no AgentRunID to correlate on: AIPromptRun.AgentRunID was
    // dropped in v5.50 (Break_CodeGen_Cycle_Remove_PromptRun_AgentRunID) and ActionExecutionLog never
    // had one. Correlating on it made this branch dead for action logs from the start, and for prompt
    // runs from v5.50 — the form simply stopped live-refreshing. Refresh unconditionally instead,
    // which is what the original comment described: the reload is debounced and re-reads only THIS
    // run, and the subscription is dropped once the run leaves 'Running', so a foreign write costs at
    // most one collapsed reload while a run is open on screen.
    if (entityName === 'MJ: AI Prompt Runs' || entityName === 'MJ: Action Execution Logs') {
      this.refreshRunDataDebounced();
    }
  }

  private resolveEventID(evt: BaseEntityEvent): string | null {
    if (evt.baseEntity) {
      return evt.baseEntity.PrimaryKey?.ToConcatenatedString() ?? null;
    }
    const payload = evt.payload as { primaryKeyValues?: string | null; recordData?: string | null } | undefined;
    if (!payload) return null;
    try {
      if (payload.primaryKeyValues) {
        const pk = JSON.parse(payload.primaryKeyValues) as Record<string, unknown> | unknown[];
        if (Array.isArray(pk)) {
          const idPair = pk.find(p => (p as { FieldName?: string }).FieldName === 'ID') as { Value?: unknown } | undefined;
          if (idPair?.Value != null) return String(idPair.Value);
        } else if (pk && typeof pk === 'object' && 'ID' in pk) {
          const v = (pk as { ID?: unknown }).ID;
          if (v != null) return String(v);
        }
      }
    } catch {
      // bad JSON — fall through to recordData
    }
    try {
      if (payload.recordData) {
        const row = JSON.parse(payload.recordData) as Record<string, unknown>;
        if (typeof row?.ID === 'string') return row.ID;
      }
    } catch {
      // ignore
    }
    return null;
  }

  /**
   * The row behind an event, for the two fields this component needs that the primary key cannot
   * give it (`Status` on the run, `AgentRunID` on a step).
   *
   * A remote event carries the row only for entities a deployment has opted into broadcasting;
   * otherwise this re-reads that one record as the signed-in user, so a session that may not read
   * it gets nothing rather than someone else's data.
   */
  private async resolveEventRow(evt: BaseEntityEvent): Promise<Record<string, unknown> | null> {
    return await ResolveEntityEventRow(evt, this.ProviderToUse);
  }

  /**
   * Collapse rapid bursts of step/prompt/action events into a single
   * reload — AgentRunner often saves several rows in quick succession.
   */
  private refreshRunDataDebounced(): void {
    if (this.refreshInFlight) return;
    this.refreshInFlight = true;
    queueMicrotask(() => {
      this.refreshInFlight = false;
      if (!this.record?.ID) return;
      this.dataHelper.loadAgentRunData(this.record.ID, true);
    });
  }
  
  private async loadAgent() {
    if (!this.record?.AgentID) return;
    
    try {
      const md = this.ProviderToUse;
      const agent = await md.GetEntityObject<MJAIAgentEntityExtended>('MJ: AI Agents');
      if (agent && await agent.Load(this.record.AgentID)) {
        this.agent = agent;
        this.cdr.detectChanges();
      }
    } catch (error) {
      console.error('Error loading agent:', error);
    }
  }

  private async loadCostMetrics() {
    if (!this.record?.ID) return;
    
    try {
      this.costMetrics = await this.costService.getAgentRunCostMetrics(this.record.ID);
      this.cdr.markForCheck();
    } catch (error) {
      console.error('Error loading cost metrics:', error);
      this.costMetrics = {
        totalCost: 0,
        totalPrompts: 0,
        totalTokensInput: 0,
        totalTokensOutput: 0,
        isLoading: false,
        error: 'Failed to load cost data'
      };
    }
  }
  
  changeTab(tab: string) {
    this.activeTab = tab;
    
    // Lazy load the Visualization (playable + static flow) view on first access
    if (tab === 'visualization' && !this.visualizationLoaded) {
      this.visualizationLoaded = true;
      this.cdr.markForCheck();
    }
    
    // Lazy load analytics when the tab is first accessed
    if (tab === 'analytics' && !this.analyticsLoaded) {
      this.analyticsLoaded = true;
      this.cdr.markForCheck();
    }
  }
  
  
  calculateDuration(start: Date, end?: Date | null): string {
    if (!end) return 'Running...';
    
    const ms = end.getTime() - start.getTime();
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    if (ms < 3600000) return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
    return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
  }
  
  selectTimelineItem(item: TimelineItem) {
    this.selectedTimelineItem = item;
    this.jsonPanelExpanded = true;
    this.cdr.markForCheck();
  }
  
  closeJsonPanel() {
    this.selectedTimelineItem = null;
    this.cdr.markForCheck();
  }
  
  navigateToSubRun(runId: string) {
    SharedService.Instance.OpenEntityRecord("MJ: AI Agent Runs", CompositeKey.FromID(runId));
  }

  navigateToParentRun() {
    if (this.record.ParentRunID) {
      SharedService.Instance.OpenEntityRecord("MJ: AI Agent Runs", CompositeKey.FromID(this.record.ParentRunID));
    }
  }
  
  navigateToActionLog(logId: string) {
    SharedService.Instance.OpenEntityRecord("MJ: Action Execution Logs", CompositeKey.FromID(logId));
  }
  
  openEntityRecord(entityName: string, recordId: string | null) {
    if (recordId) {
      SharedService.Instance.OpenEntityRecord(entityName, CompositeKey.FromID(recordId));
    }
  }
  
  navigateToEntityRecord(event: { entityName: string; recordId: string }) {
    SharedService.Instance.OpenEntityRecord(event.entityName, CompositeKey.FromID(event.recordId));
  }

  /**
   * Navigate to the conversation in the Chat application
   */
  navigateToConversation() {
    if (!this.record?.ConversationID) return;

    // Find the Chat app
    const chatApp = this.appManager.GetAllApps().find(app => app.Name === 'Chat');
    if (!chatApp) {
      console.warn('Chat application not found');
      return;
    }

    // Navigate to the Conversations nav item with the conversationId parameter
    this.navigationService.OpenNavItemByName(
      'Conversations',
      { conversationId: this.record.ConversationID },
      chatApp.ID
    );
  }
  
  refreshData() {
    // Reload the agent run record to get latest status
    if (this.record?.ID) {
      // Clear parsed cache when refreshing data
      this.clearParsedCache();
      
      // No panel states to reset in simplified approach
      
      this.record.Load(this.record.ID).then(() => {
        // Clear cost cache and reload
        this.costService.clearCache(this.record.ID);
        this.loadCostMetrics();
        
        // Reload data through helper - this will update all components (force reload for refresh)
        this.dataHelper.loadAgentRunData(this.record.ID, true);
        
        // Trigger analytics refresh
        if (this.analyticsComponent) {
          this.analyticsComponent.loadData();
        }
      });
    }
  }
  
  
  getStatusIcon(status: string): string {
    const iconMap: Record<string, string> = {
      'Running': 'fa-circle-notch fa-spin',
      'Completed': 'fa-check-circle',
      'Failed': 'fa-times-circle',
      'Cancelled': 'fa-ban',
      'Paused': 'fa-pause-circle'
    };
    return iconMap[status] || 'fa-question-circle';
  }
  
  async copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      // Could show a toast notification here
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  }
  
  /**
   * Get the Result field with recursive JSON parsing applied
   */
  get parsedResult(): string {
    if (!this.record?.Result) {
      return '';
    }
    
    // Return cached result if available
    if (this._cachedParsedResult !== null) {
      return this._cachedParsedResult;
    }
    
    
    try {
      // First, check if Result is a JSON string that needs to be parsed
      let resultData = this.record.Result;
      try {
        // If Result is a JSON string, parse it first
        resultData = JSON.parse(this.record.Result);
      } catch {
        // If it's not valid JSON, use it as-is
        resultData = this.record.Result;
      }
      
      const parseOptions: ParseJSONOptions = {
        extractInlineJson: true,
        maxDepth: 100,
        debug: false // Disable debug logging - regex issue fixed
      };
      // Re-enabled ParseJSONRecursive with performance optimizations
      const parsed = ParseJSONRecursive(resultData, parseOptions);
      const result = JSON.stringify(parsed, null, 2);
      
      // Cache the result
      this._cachedParsedResult = result;
      
      return result;
    } catch (e) {
      const fallbackResult = this.record.Result;
      this._cachedParsedResult = fallbackResult;
      return fallbackResult;
    }
  }
  
  /**
   * Get the Starting Payload field with recursive JSON parsing applied
   */
  get parsedStartingPayload(): string {
    if (!this.record?.StartingPayload) {
      return '';
    }
    
    // Return cached result if available
    if (this._cachedParsedStartingPayload !== null) {
      return this._cachedParsedStartingPayload;
    }
    
    
    try {
      // First, check if StartingPayload is a JSON string that needs to be parsed
      let payloadData = this.record.StartingPayload;
      try {
        // If StartingPayload is a JSON string, parse it first
        payloadData = JSON.parse(this.record.StartingPayload);
      } catch {
        // If it's not valid JSON, use it as-is
        payloadData = this.record.StartingPayload;
      }
      
      const parseOptions: ParseJSONOptions = {
        extractInlineJson: true,
        maxDepth: 100,
        debug: false
      };
      // Re-enabled ParseJSONRecursive with performance optimizations
      const parsed = ParseJSONRecursive(payloadData, parseOptions);
      const result = JSON.stringify(parsed, null, 2);
      
      // Cache the result
      this._cachedParsedStartingPayload = result;
      
      return result;
    } catch (e) {
      const fallbackResult = this.record.StartingPayload;
      this._cachedParsedStartingPayload = fallbackResult;
      return fallbackResult;
    }
  }

  /**
   * Get the Final Payload (state) field with recursive JSON parsing applied
   */
  get parsedFinalPayload(): string {
    if (!this.record?.FinalPayload) return '';
    
    // Return cached result if available
    if (this._cachedParsedFinalPayload !== null) {
      return this._cachedParsedFinalPayload;
    }
    
    try {
      // First, check if FinalPayload is a JSON string that needs to be parsed
      let payloadData = this.record.FinalPayload;
      try {
        // If FinalPayload is a JSON string, parse it first
        payloadData = JSON.parse(this.record.FinalPayload);
      } catch {
        // If it's not valid JSON, use it as-is
        payloadData = this.record.FinalPayload;
      }
      
      const parseOptions: ParseJSONOptions = {
        extractInlineJson: true,
        maxDepth: 100,
        debug: false // Disable debug logging - regex issue fixed
      };
      // Re-enabled ParseJSONRecursive with performance optimizations
      const parsed = ParseJSONRecursive(payloadData, parseOptions);
      const result = JSON.stringify(parsed, null, 2);
      
      // Cache the result
      this._cachedParsedFinalPayload = result;
      
      return result;
    } catch (e) {
      const fallbackResult = this.record.FinalPayload;
      this._cachedParsedFinalPayload = fallbackResult;
      return fallbackResult;
    }
  }

  /**
   * Get the Data field with recursive JSON parsing applied
   */
  get parsedData(): string {
    if (!this.record?.Data) return '';
    
    // Return cached result if available
    if (this._cachedParsedData !== null) {
      return this._cachedParsedData;
    }
    
    try {
      // First, check if Data is a JSON string that needs to be parsed
      let data = this.record.Data;
      try {
        // If Data is a JSON string, parse it first
        data = JSON.parse(this.record.Data);
      } catch {
        // If it's not valid JSON, use it as-is
        data = this.record.Data;
      }
      
      const parseOptions: ParseJSONOptions = {
        extractInlineJson: true,
        maxDepth: 100,
        debug: false
      };
      // Re-enabled ParseJSONRecursive with performance optimizations
      const parsed = ParseJSONRecursive(data, parseOptions);
      const result = JSON.stringify(parsed, null, 2);
      
      // Cache the result
      this._cachedParsedData = result;
      
      return result;
    } catch (e) {
      const fallbackResult = this.record.Data;
      this._cachedParsedData = fallbackResult;
      return fallbackResult;
    }
  }
  
  /**
   * Get parsed Starting Payload as an object for deep diff
   */
  get startingPayloadObject(): any {
    if (!this.record?.StartingPayload) return null;
    
    try {
      // First, check if StartingPayload is a JSON string that needs to be parsed
      let payloadData = this.record.StartingPayload;
      try {
        // If StartingPayload is a JSON string, parse it first
        payloadData = JSON.parse(this.record.StartingPayload);
      } catch {
        // If it's not valid JSON, use it as-is
        payloadData = this.record.StartingPayload;
      }
      
      const parseOptions: ParseJSONOptions = {
        extractInlineJson: true,
        maxDepth: 100,
        debug: false
      };
      // Re-enabled ParseJSONRecursive with performance optimizations
      return ParseJSONRecursive(payloadData, parseOptions);
    } catch (e) {
      return null;
    }
  }

  /**
   * Get parsed Final Payload as an object for deep diff
   */
  get finalPayloadObject(): any {
    if (!this.record?.FinalPayload) return null;
    
    try {
      // First, check if FinalPayload is a JSON string that needs to be parsed
      let payloadData = this.record.FinalPayload;
      try {
        // If FinalPayload is a JSON string, parse it first
        payloadData = JSON.parse(this.record.FinalPayload);
      } catch {
        // If it's not valid JSON, use it as-is
        payloadData = this.record.FinalPayload;
      }
      
      const parseOptions: ParseJSONOptions = {
        extractInlineJson: true,
        maxDepth: 100,
        debug: false
      };
      // Re-enabled ParseJSONRecursive with performance optimizations
      return ParseJSONRecursive(payloadData, parseOptions);
    } catch (e) {
      return null;
    }
  }

  /**
   * Clear all cached parsed results
   */
  private clearParsedCache(): void {
    this._cachedParsedResult = null;
    this._cachedParsedStartingPayload = null;
    this._cachedParsedFinalPayload = null;
    this._cachedParsedData = null;
    this._allParsingComplete = false;
  }
  
  /**
   * Parse all JSON fields at once and cache results
   */
  private parseAllFields(): void {
    try {
      let parsedCount = 0;
      
      // Parse all fields that exist
      if (this.record?.Result) {
        this.parsedResult; // Triggers parsing and caching
        parsedCount++;
      }
      
      if (this.record?.StartingPayload) {
        this.parsedStartingPayload; // Triggers parsing and caching
        parsedCount++;
      }
      
      if (this.record?.FinalPayload) {
        this.parsedFinalPayload; // Triggers parsing and caching
        parsedCount++;
      }
      
      if (this.record?.Data) {
        this.parsedData; // Triggers parsing and caching
        parsedCount++;
      }
      
      this._allParsingComplete = true;
      
    } catch (error) {
      console.error('Error during JSON parsing:', error);
    }
  }
  
  /**
   * Check if all parsing is complete - used by template
   */
  get isParsingComplete(): boolean {
    return this._allParsingComplete;
  }

  /**
   * Check if we have both payloads to show diff
   */
  get showPayloadDiff(): boolean {
    return !!(this.record?.StartingPayload && this.record?.FinalPayload);
  }

  /**
   * Check if selected timeline item is a step with payload changes
   */
  get showStepPayloadDiff(): boolean {
    if (!this.selectedTimelineItem || this.selectedTimelineItem.type !== 'step') {
      return false;
    }
    
    const stepData = this.selectedTimelineItem.data;
    if (stepData && (stepData.PayloadAtStart?.trim().length > 0 
                 || stepData.PayloadAtEnd?.trim().length > 0)) {
      return stepData.PayloadAtStart !== stepData.PayloadAtEnd;
    }
    else {
      return false;
    }
  }

  /**
   * Get parsed PayloadAtStart for the selected step
   */
  get stepPayloadAtStartObject(): any {
    if (!this.selectedTimelineItem || this.selectedTimelineItem.type !== 'step') {
      return null;
    }
    
    const stepData = this.selectedTimelineItem.data;
    if (!stepData || !stepData.PayloadAtStart) {
      return null;
    }
    
    try {
      let payloadData = stepData.PayloadAtStart;
      try {
        payloadData = JSON.parse(stepData.PayloadAtStart);
      } catch {
        payloadData = stepData.PayloadAtStart;
      }
      
      const parseOptions: ParseJSONOptions = {
        extractInlineJson: true,
        maxDepth: 100,
        debug: false
      };
      // Re-enabled ParseJSONRecursive with performance optimizations
      return ParseJSONRecursive(payloadData, parseOptions);
    } catch (e) {
      return null;
    }
  }

  /**
   * Get parsed PayloadAtEnd for the selected step
   */
  get stepPayloadAtEndObject(): any {
    if (!this.selectedTimelineItem || this.selectedTimelineItem.type !== 'step') {
      return null;
    }
    
    const stepData = this.selectedTimelineItem.data;
    if (!stepData || !stepData.PayloadAtEnd) {
      return null;
    }
    
    try {
      let payloadData = stepData.PayloadAtEnd;
      try {
        payloadData = JSON.parse(stepData.PayloadAtEnd);
      } catch {
        payloadData = stepData.PayloadAtEnd;
      }
      
      const parseOptions: ParseJSONOptions = {
        extractInlineJson: true,
        maxDepth: 100,
        debug: false
      };
      // Re-enabled ParseJSONRecursive with performance optimizations
      return ParseJSONRecursive(payloadData, parseOptions);
    } catch (e) {
      return null;
    }
  }
}
