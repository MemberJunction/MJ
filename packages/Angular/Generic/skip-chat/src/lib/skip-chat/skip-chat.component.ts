import {
  AfterViewInit,
  AfterViewChecked,
  Component,
  OnInit,
  ViewChild,
  ViewContainerRef,
  Renderer2,
  ElementRef,
  OnDestroy,
  Input,
  ChangeDetectorRef,
  Output,
  EventEmitter,
} from '@angular/core';
import { Location } from '@angular/common';
import { ActivatedRoute, ActivationEnd, Router } from '@angular/router';
import { LogError, UserInfo, CompositeKey, LogStatus, RunView } from '@memberjunction/core';
import { MJConversationDetailEntity, MJConversationEntity, MJDataContextEntity, MJDataContextItemEntity, ResourcePermissionEngine, MJConversationArtifactEntity, MJConversationArtifactVersionEntity } from '@memberjunction/core-entities';
import { GraphQLDataProvider, GraphQLProviderConfigData } from '@memberjunction/graphql-dataprovider';
import { Container } from '@memberjunction/ng-container-directives';

import { Subscription } from 'rxjs';
import { take, filter } from 'rxjs/operators';
import { ListViewComponent } from '@progress/kendo-angular-listview';
import {
  MJAPISkipResult,
  SkipAPIAnalysisCompleteResponse,
  SkipAPIResponse,
  SkipResponsePhase,
} from '@memberjunction/skip-types';
import { DataContext } from '@memberjunction/data-context';
import { CopyScalarsAndArrays, InvokeManualResize, MJEvent, MJEventType, MJGlobal, SafeJSONParse } from '@memberjunction/global';
import { SkipSingleMessageComponent } from '../skip-single-message/skip-single-message.component';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { ResourcePermissionsComponent } from '@memberjunction/ng-resource-permissions';
import { DrillDownInfo } from '../drill-down-info';
import { DialogService, DialogRef } from '@progress/kendo-angular-dialog';
import { BaseManagedComponent } from '../base-managed-component';

@Component({
  standalone: false,
  selector: 'skip-chat',
  templateUrl: './skip-chat.component.html',
  styleUrls: ['./skip-chat.component.css'],
})
export class SkipChatComponent extends BaseManagedComponent implements OnInit, AfterViewInit, AfterViewChecked, OnDestroy {
  @Input() AllowSend: boolean = true;
  @Input() public Messages: MJConversationDetailEntity[] = [];
  @Input() public Conversations: MJConversationEntity[] = [];
  @Input() public SelectedConversation: MJConversationEntity | undefined;
  @Input() public ConversationEditMode: boolean = false;
  /**
   * If true, the component will show the conversation list. Default is true.
   */
  @Input() public ShowConversationList: boolean = true;
  @Input() public AllowNewConversations: boolean = true;
  @Input() public Title: string = 'Ask Skip';
  @Input() public DataContextID: string = '';
  @Input() public LinkedEntity: string = '';
  @Input() public LinkedEntityCompositeKey: CompositeKey = new CompositeKey();
  @Input() public ShowDataContextButton: boolean = true;
  @Input() public IncludeLinkedConversationsInList: boolean = false;
  @Input() public SkipLogoURL: string = "assets/Skip Full Logo - Transparent.png";
  @Input() public SkipMarkOnlyLogoURL: string = "assets/skip-icon.svg";
  /**
   * Set this property in order to set the user image. This can either be a URL or a Blob
   */
  @Input() public UserImage: string | Blob | undefined = undefined;

  @Input() public VerboseLogging: boolean = false;
  
  /**
   * If true, the component will update the browser URL when the conversation changes. If false, it will not update the URL. Default is true.
   */
  @Input() public UpdateAppRoute: boolean = true;

  /**
   * When set to true, the small Skip logo is shown in the conversation list on the top left of the component
   */
  @Input() public ShowSkipLogoInConversationList: boolean = false;

  /**
   * When set to true, the component will show a sharing button that allows the user to share the conversation with others. Default is true.
   */
  @Input() public ShowSharingButton: boolean = true;

  /**
   * This array of role names will be excluded from the list of possible roles to share the conversation with.
   */
  @Input() public SharingExcludeRoleNames: string[] = [];

  /**
   * This array of emails will be excluded from the list of possible roles to share the conversation with.
   */
  @Input() public SharingExcludeEmails: string[] = [];
  
  /**
   * Whether to enable the split-panel viewing for artifacts. Default is true.
   */
  @Input() public EnableArtifactSplitView: boolean = true;
  
  /**
   * Default ratio for split panels when viewing artifacts (0-1). Default is 0.5 (left panel takes 50% of width).
   */
  @Input() public DefaultSplitRatio: number = 0.5;

  /**
   * This property is used to set the placeholder text for the textbox where the user types their message to Skip.   
   */
  @Input() public DefaultTextboxPlaceholder: string = 'Type your message to Skip here...';
  /**
   * This property is used to set the placeholder text for the textbox where the user types their message to Skip when Skip is processing a request and the text area is disabled.
   */
  @Input() public ProcessingTextBoxPlaceholder: string = 'Please wait...';

 
 
  /**
   * Event emitted when the user clicks on a matching report and the application needs to handle the navigation
   */
  @Output() NavigateToMatchingReport = new EventEmitter<string>();

  /**
   * Event emitted whenever a conversation is selected
   */
  @Output() ConversationSelected = new EventEmitter<string>();

  /**
   * This event fires whenever a new report is created.
   */
  @Output() NewReportCreated = new EventEmitter<string>();

  /**
   * This event fires whenever a drill down is requested within a given report.
   */
  @Output() DrillDownEvent = new EventEmitter<DrillDownInfo>();  
  
  /**
   * This event fires when an artifact is selected
   */
  @Output() ArtifactSelected = new EventEmitter<any>();
  
  /**
   * This event fires when an artifact is viewed in the split panel
   */
  @Output() ArtifactViewed = new EventEmitter<any>();

  
  @ViewChild(Container, { static: true }) askSkip!: Container;
  @ViewChild('AskSkipPanel', { static: true }) askSkipPanel!: ElementRef;
  @ViewChild('mjContainer', { read: ViewContainerRef }) mjContainerRef!: ViewContainerRef;
  @ViewChild('conversationList', { static: false }) conversationList!: ListViewComponent;
  @ViewChild('AskSkipInput') askSkipInput: any;
  @ViewChild('scrollContainer') private scrollContainer: ElementRef | undefined;
  @ViewChild('topLevelDiv') topLevelDiv!: ElementRef;
  @ViewChild('resourcePermissions') set resourcePermissionsRef(
    component: ResourcePermissionsComponent | undefined
  ) {
    if (component) {
      // Component is instantiated
      this.resourcePermissions = component;
    } else {
      // Component is destroyed
      this.resourcePermissions = null;
    }
  }
  resourcePermissions: ResourcePermissionsComponent | null = null;


  /**
   * Internal state variable to track if the conversation list is visible or not. Defaults to true. Conversation List only is shown if this is true and ShowConversationList is true.
   */
  public IsConversationListVisible: boolean = true;

  public SelectedConversationUser: UserInfo | undefined;
  public DataContext!: DataContext;

  public _showScrollToBottomIcon = false;

  public _AskSkipTextboxPlaceholder: string = 'Type your message here...';

  private _messageInProgress: boolean = false;
  private _conversationsInProgress: { [key: string]: any } = {};
  private _conversationsToReload: { [key: string]: boolean } = {};
  public _conversationLoadComplete: boolean = false;
  private _temporaryMessage: MJConversationDetailEntity | undefined;
  private _intersectionObserver: IntersectionObserver | undefined;
  private static __skipChatWindowsCurrentlyVisible: number = 0;
  private sub?: Subscription;
  
  // Per-conversation status message tracking
  private _statusMessagesByConversation: { [conversationId: string]: { message: string; startTime?: Date } } = {};
  private _temporaryMessagesByConversation: { [conversationId: string]: MJConversationDetailEntity } = {};
  
  /**
   * Currently selected artifact for viewing in the split panel
   */
  public selectedArtifact: any = null;
  
  /**
   * Artifact header info to display in split panel
   */
  public artifactHeaderInfo: {
    title: string;
    type: string;
    date: Date | null;
    version: string;
  } | null = null;
  
  /**
   * Artifact version list for dropdown
   */
  public artifactVersionList: Array<{ID: string, Version: string | number, __mj_CreatedAt: Date}> = [];
  
  /**
   * Selected artifact version ID
   */
  public selectedArtifactVersionId: string = '';
  
  /**
   * Current split ratio for the split panel
   */
  public SplitRatio: number = this.DefaultSplitRatio;

  /**
   * The questions that will be displayed in the welcome screen.
   */
  @Input() public WelcomeQuestions = [
    {
      topLine: 'Create a report',
      bottomLine: 'with any of your data in it, just ask',
      prompt: "I'd like help creating a new report with data in my system. Can you help me get started?",
    },
    {
      topLine: 'Learn more about',
      bottomLine: 'specific records in the database',
      prompt:
        'I would like to dig deeper into my database and get you to analyze a specific record in the database, can you help me with that?',
    },
    {
      topLine: 'Get business advice',
      bottomLine: 'to improve operating results and more',
      prompt:
        'I need some advice on how to improve my business operations, can you help me analyze my data and then think about ways to improve my operating results?',
    },
    {
      topLine: 'Seek marketing help',
      bottomLine: 'to segment your audience or build campaigns',
      prompt:
        'I need help with marketing, can you help me analyze my data and then think about ways to segment my audience and build campaigns to improve revenue and retention?',
    },
  ];

  constructor(
    private el: ElementRef,
    private renderer: Renderer2,
    private route: ActivatedRoute,
    private router: Router,
    private location: Location,
    private cdRef: ChangeDetectorRef,
    private notificationService: MJNotificationService,
    private dialogService: DialogService,
  ) {
    super();
  }

  private paramsSubscription!: Subscription;
  ngOnInit() {
  }

  public static get SkipChatWindowsCurrentlyVisible(): number {
    return SkipChatComponent.__skipChatWindowsCurrentlyVisible;
  }

  private _mjGlobalEventSub: Subscription | undefined;
  private _providerPushStatusSub: Subscription | undefined;
  protected SubscribeToNotifications() {
    try {
      // subscribe to MJ events for push status updates, but first unsubscribe if we are already subscribed
      if (this._mjGlobalEventSub) {
        try {
          this._mjGlobalEventSub.unsubscribe();
        }
        catch (e) {
          LogError(`Error unsubscribing from provider push status updates: ${e}`);
        }
        finally {
          this._mjGlobalEventSub = undefined;
        }
      }
      this._mjGlobalEventSub = MJGlobal.Instance.GetEventListener().subscribe((event: MJEvent) => {
        if (event.event === MJEventType.ComponentEvent) {
          if (!event.args) {
            return;
          }
          this.HandlePushStatusUpdate(event.args);
        }
      });


      // Set up the push status subscription
      this.setupPushStatusSubscription();
    } catch (e) {
      LogError(e);
    }
  }

  protected LogVerbose(message: string) {
    if (this.VerboseLogging) {
      LogStatus(message);
    }
  }
  
  /**
   * Sets up or re-establishes the push status subscription
   * This is extracted as a separate method so it can be called after page reloads
   */
  protected setupPushStatusSubscription() {
    try {
      // Directly subscribe to the push status updates from the GraphQLDataProvider. If SkipChat is running in an environment where someone else is NOT 
      // picking them up and broadcasting via MJ Events, we need this. If we get both, that's okay too as the update will not look any different and be 
      // near instant from the user's perspective.
      // FIRST, unsubscribe if we are already subscribed
      if (this._providerPushStatusSub) {
        try {
          this._providerPushStatusSub.unsubscribe();
        }
        catch (e) {
          LogError(`Error unsubscribing from provider push status updates: ${e}`);
        }
        finally {
          this._providerPushStatusSub = undefined;
        }
      }
      
      this._providerPushStatusSub = (this.ProviderToUse as GraphQLDataProvider).PushStatusUpdates().subscribe((status: any) => {
        this.LogVerbose('Push status update received in Skip Chat: ' + JSON.stringify(status));
        if (status && status.message) {
          const statusObj = SafeJSONParse<any>(status.message);
          if (statusObj) {
            if (statusObj.type === 'AskSkip' || statusObj.type === 'ConversationStatusUpdate') {
              this.HandlePushStatusUpdate(statusObj);  
            }
          }
        }
      });
    } catch (e) {
      LogError(`Error setting up push status subscription: ${e}`);
    }
  }

  protected HandlePushStatusUpdate(statusObj: any) {
    try {
      const obj: { type?: string; 
                   status?: string; 
                   ResponsePhase: string, 
                   conversationID?: string; 
                   message?: string } = statusObj;
      
      // Handle conversation status updates from the backend
      if (obj.type === 'ConversationStatusUpdate' && obj.conversationID) {
        // Find and update the conversation in our cached list
        const conversation = this.Conversations.find(c => c.ID === obj.conversationID);
        if (conversation && (obj.status === 'Processing' || obj.status === 'Available')) {
          conversation.Status = obj.status;
          
          // Handle status changes
          if (obj.status === 'Processing') {
            // Conversation started processing
            if (obj.conversationID === this.SelectedConversation?.ID) {
              // If this is the currently selected conversation, ensure we show status message
              const cachedStatus = this._statusMessagesByConversation[obj.conversationID];
              if (cachedStatus) {
                this.SetSkipStatusMessage(cachedStatus.message, 0, cachedStatus.startTime);
              }
            }
          } else if (obj.status === 'Available') {
            // Conversation finished processing - clear its tracking data
            delete this._conversationsInProgress[obj.conversationID];
            this._processingStatus[obj.conversationID] = false; // Set to false instead of deleting
            delete this._statusMessagesByConversation[obj.conversationID];
            delete this._temporaryMessagesByConversation[obj.conversationID];
            
            // Only clear the UI status message if this is the currently selected conversation
            if (obj.conversationID === this.SelectedConversation?.ID) {
              this.SetSkipStatusMessage('', 0);
            }
          }
        }
      } else if (obj.type?.trim().toLowerCase() === 'askskip' && obj.status?.trim().toLowerCase() === 'ok') {
        if (obj.conversationID && this._conversationsInProgress[obj.conversationID]) {
          // Cache the status message for this conversation regardless of whether it's selected
          if (obj.message && obj.message.length > 0) {
            // Keep the original start time if it exists, otherwise use now
            const existingStatus = this._statusMessagesByConversation[obj.conversationID];
            this._statusMessagesByConversation[obj.conversationID] = {
              message: obj.message,
              startTime: existingStatus?.startTime || new Date()
            };
            this.LogVerbose(`Skip Chat: Cached status message for conversation ${obj.conversationID}: ${obj.message}`);
          }
          
          // If this is the currently selected conversation, update the display
          if (obj.conversationID === this.SelectedConversation?.ID) {
            if (obj.message && obj.message.length > 0) {
              // we are in the midst of a possibly long running process for Skip, and we got a message here, so go ahead and display it in the temporary message
              this.LogVerbose(`Skip Chat: Displaying Push Status for conversation ${obj.conversationID} with message: ${obj.message}`);
              // Use the cached start time to preserve the timer
              const cachedStatus = this._statusMessagesByConversation[obj.conversationID];
              this.SetSkipStatusMessage(obj.message, 0, cachedStatus?.startTime);
            }
            else {
              this.LogVerbose(`Skip Chat: Received Push Status but no message for conversation ${obj.conversationID}`);
            }
          }
          else {
            this.LogVerbose(`Skip Chat: Received Push Status for conversation ${obj.conversationID} but it's not the current conversation - cached for later`);
          }
        }
        else {
          this.LogVerbose(`Skip Chat: Received Push Status for conversation ${obj.conversationID} but it's not in progress in this instance of the SkipChat component. Current conversations in progress: ${JSON.stringify(this._conversationsInProgress)} `);
        }
      }
      else {
        this.LogVerbose(`Skip Chat: Received Push Status but it's not for AskSkip or not status of OK: ${JSON.stringify(CopyScalarsAndArrays(statusObj))}`);
      }
    }
    catch (e) {
      LogError(e);
    }
  }

  public splitterCollapseStateChanged(e: boolean) {
    InvokeManualResize();
  }

  public get ConversationListCurrentlyVisible(): boolean {
    return this.IsConversationListVisible && this.ShowConversationList;
  }

  public DisplayConversationList(show: boolean = true) {
    if (show !== this.IsConversationListVisible) {
      this.IsConversationListVisible = show;
      this.cdRef.detectChanges();
      InvokeManualResize();
    }
  }

  public GetConversationItemClass(item: MJConversationEntity) {
    let classInfo: string = '';
    if (this.SelectedConversation?.ID === item.ID) classInfo += 'conversation-item-selected';
    if (item.LinkedEntityID && item.LinkedRecordID) {
      // an embedded conversation
      classInfo += ' conversation-item-linked';
    }

    return classInfo;
  }

  protected SetSkipStatusMessage(message: string, delay: number, startTime?: Date) {
    if (delay && delay > 0) {
      this.setTimeout(() => {
        this.InnerSetSkipStatusMessage(message, startTime);
      }, delay, { purpose: 'skip-status-message' });
    } 
    else 
      this.InnerSetSkipStatusMessage(message, startTime);
  }

  protected InnerSetSkipStatusMessage(message: string, startTime?: Date) {
    const conversationId = this.SelectedConversation?.ID;
    
    if (message && message.length > 0) {
      // Store the status message for the current conversation
      if (conversationId) {
        // Preserve existing start time if we have one
        const existingStatus = this._statusMessagesByConversation[conversationId];
        this._statusMessagesByConversation[conversationId] = {
          message,
          startTime: startTime || existingStatus?.startTime || new Date()
        };
      }
      
      if (!this._temporaryMessage) {
        const actualStartTime = startTime || (conversationId ? this._statusMessagesByConversation[conversationId]?.startTime : undefined) || new Date();
        this._temporaryMessage = <MJConversationDetailEntity>(<any>{ ID: -1, Message: message, Role: 'ai', __mj_CreatedAt: actualStartTime }); // create a new object
        this.AddMessageToCurrentConversation(this._temporaryMessage, true, false);
        
        // Store the temporary message for this conversation
        if (conversationId) {
          this._temporaryMessagesByConversation[conversationId] = this._temporaryMessage;
        }
      } else {
        this._temporaryMessage.Message = message;
        // we need to send a refresh signal to the component linked to this detail record
        const ref = (<any>this._temporaryMessage)._componentRef;
        if (ref) {
          const obj = ref.instance;
          if (obj && obj.RefreshMessage) 
            obj.RefreshMessage();
        }
      }
      this._AskSkipTextboxPlaceholder = this.ProcessingTextBoxPlaceholder;
    } 
    else {
      if (this._temporaryMessage) {
        // get rid of the temporary message
        this.RemoveMessageFromCurrentConversation(this._temporaryMessage);
        this._temporaryMessage = undefined;
        
        // Clear the cached temporary message for this conversation
        if (conversationId && this._temporaryMessagesByConversation[conversationId]) {
          delete this._temporaryMessagesByConversation[conversationId];
        }
      }
      
      // Clear the status message cache when clearing the message
      if (conversationId && this._statusMessagesByConversation[conversationId]) {
        delete this._statusMessagesByConversation[conversationId];
      }
      
      this._AskSkipTextboxPlaceholder = this.DefaultTextboxPlaceholder;
    }
  }

  protected async SetSelectedConversationUser() {
    if (this.SelectedConversation?.UserID) {
      const p = this.ProviderToUse;
      if (p.CurrentUser.ID !== this.SelectedConversation.UserID) {
        const result = await this.RunViewToUse.RunView({
          EntityName: 'MJ: Users',
          ExtraFilter: `ID='${this.SelectedConversation.UserID}'`,
        });
        this.SelectedConversationUser = result && result.Success ? <UserInfo>result.Results[0] : undefined;
      } 
      else 
        this.SelectedConversationUser = p.CurrentUser; // current user is the one for this convo, just use that to avoid the extra query
    }
  }
 
  public get LinkedEntityID(): string | null {
    if (this.LinkedEntity && this.LinkedEntity.length > 0) {
      // lookup the entity id from the linkedentity provided to us as a property
      const e = this.ProviderToUse.Entities.find((e) => e.Name === this.LinkedEntity);
      if (e) 
        return e.ID;
    }
    return null;
  }
  
  /**
   * Checks for conversations that are in 'Processing' status and updates the client-side state
   */
  protected checkForProcessingConversations() {
    try {
      if (this.Conversations && this.Conversations.length > 0) {
        let hasProcessingConversations = false;
        
        // Check each conversation's status
        for (const convo of this.Conversations) {
          if (convo.Status === 'Processing') {
            hasProcessingConversations = true;
            
            // Mark as in progress
            this._conversationsInProgress[convo.ID] = true;
            this._processingStatus[convo.ID] = true; // Also update processing status for UI
            this._messageInProgress = true;
            this.AllowSend = false;
            
            // If this is the currently selected conversation, update the UI
            if (this.SelectedConversation && this.SelectedConversation.ID === convo.ID) {
              this.setProcessingStatus(convo.ID, true);
              this.startRequestStatusPolling(convo.ID);
              
              // Don't overwrite if we're already handling this conversation
              if (!this._temporaryMessage) {
                // Restore the cached status message if available
                const cachedStatus = this._statusMessagesByConversation[convo.ID];
                const statusMessage = cachedStatus?.message || "Processing...";
                const statusStartTime = cachedStatus?.startTime || convo.__mj_UpdatedAt;
                
                this.SetSkipStatusMessage(statusMessage, 0, statusStartTime);
                
                // Note: We don't request status here as SelectConversation will handle it
                // This avoids duplicate requests to the backend
              }
            }
          }
        }
        
        // If we have processing conversations and no push subscription, set it up
        if (hasProcessingConversations && !this._providerPushStatusSub) {
          this.setupPushStatusSubscription();
        }
      }
    } catch (error) {
      LogError(`Error checking for processing conversations: ${error}`);
    }
  }
  
  // Track the polling intervals for reference
  private _requestStatusPollingIntervals: { [key: string]: number } = {};
  
  /**
   * Starts polling for conversation status updates
   * @param convoID The ID of the conversation to poll for
   */
  protected startRequestStatusPolling(convoID: string) {
    // Clear any existing polling for this conversation
    this.stopRequestStatusPolling(convoID);
    
    // Set up polling every 3 seconds
    this._requestStatusPollingIntervals[convoID] = this.setInterval(async () => {
      await this.checkRequestStatus(convoID);
    }, 3000, { purpose: 'conversation-status-polling', conversationId: convoID });
  }
  
  /**
   * Stops polling for conversation status updates
   * @param conversationId The ID of the conversation to stop polling for
   */
  protected stopRequestStatusPolling(conversationId: string) {
    if (this._requestStatusPollingIntervals[conversationId]) {
      this.clearInterval(this._requestStatusPollingIntervals[conversationId]);
      delete this._requestStatusPollingIntervals[conversationId];
    }
  }
  
  /**
   * Requests the current status message from the backend for a processing conversation
   * This is needed after page reloads when we lose the cached status messages
   */
  protected async requestCurrentConversationStatus(conversationId: string) {
    try {
      // Make sure we're subscribed to push updates if we aren't already
      // This ensures we'll receive any ongoing status updates
      if (!this._providerPushStatusSub) {
        this.setupPushStatusSubscription();
      }
      
      // Mark this conversation as in progress so we handle future updates properly
      this._conversationsInProgress[conversationId] = true;
      
      // Call the backend to re-attach this session to the processing conversation
      const gql = `query ReattachToProcessingConversation($conversationId: String!) {
        ReattachToProcessingConversation(ConversationId: $conversationId) {
          lastStatusMessage
          startTime
        }
      }`;
      
      const gqlProvider = this.ProviderToUse as GraphQLDataProvider;
      const result = await gqlProvider.ExecuteGQL(gql, {
        conversationId: conversationId
      });
      
      if (result && result.ReattachToProcessingConversation) {
        const response = result.ReattachToProcessingConversation;
        const lastStatusMessage = response.lastStatusMessage;
        const startTime = response.startTime ? new Date(response.startTime) : null;
        
        // Update the cached status message with what we got from the backend
        if (lastStatusMessage && lastStatusMessage !== 'Processing your request...') {
          this._statusMessagesByConversation[conversationId] = {
            message: lastStatusMessage,
            startTime: startTime || this._statusMessagesByConversation[conversationId]?.startTime || new Date()
          };
          
          // Update the display if this is the current conversation
          if (conversationId === this.SelectedConversation?.ID) {
            const cachedStatus = this._statusMessagesByConversation[conversationId];
            this.SetSkipStatusMessage(lastStatusMessage, 0, cachedStatus?.startTime);
          }
        }
      } else {
        // Could not re-attach - conversation may no longer be processing
      }
      
    } catch (error) {
      LogError(`Error requesting conversation status: ${error}`);
    }
  }

 /**
  * Loads conversation details for a specific conversation and role
  * @param conversationId The ID of the conversation
  * @param role Optional role filter (User or AI)
  * @param limit Optional limit on number of records to return
  * @returns Array of MJConversationDetailEntity objects
  */
  protected async LoadRecentConversationDetails(
    conversationId: string,
    role?: string,
    limit?: number
  ): Promise<MJConversationDetailEntity[]> {
    try {
      if (!conversationId || conversationId.length === 0) {
        return [];
      }

      // Construct the query to run
      const extraFilter = role ?
        `ConversationID='${conversationId}' AND Role='${role}'` :
        `ConversationID='${conversationId}'`;

      // Use RunView for convenience
      const result = await this.RunViewToUse.RunView<MJConversationDetailEntity>({
        EntityName: 'MJ: Conversation Details',
        ExtraFilter: extraFilter,
        ResultType: 'entity_object',
        OrderBy: '__mj_CreatedAt DESC', // Most recent first
        IgnoreMaxRows: false,
        MaxRows: limit,
      });

      if (result && result.Success) {
        return result.Results;
      }

      return [];
    } catch (err) {
    LogError(`Error loading conversation details: ${err}`);
      return [];
    }
  }
  
  /**
   * Checks the status of a conversation request
   * @param convoID The ID of the conversation to check
   */
  protected async checkRequestStatus(convoID: string) {
    try {
      const p = this.ProviderToUse;
      const conversation = <MJConversationEntity>await p.GetEntityObject('MJ: Conversations', p.CurrentUser);
      const loadResult = await conversation.Load(convoID);

      if (loadResult && conversation.Status === 'Available') {
        // Conversation is no longer processing, stop polling and refresh the conversation
        this.stopRequestStatusPolling(conversation.ID);

        this.cdRef.detach();
        if (convoID !== this.SelectedConversation?.ID) {
          // this scenario arises when we have a selected convo change after we submitted our request to skip
          // so we just mark it for reload, don't update processing status
          //the next time the user selects this convo, we will fetch messages
          //from the server rather than using the ones in cache
          this._conversationsToReload[convoID] = true;
        } 
        else {
          // Only update processing status for the selected conversation
          this.setProcessingStatus(convoID, false);

          if (this.SelectedConversation.Name === 'New Chat' || this.SelectedConversation.Name?.trim().length === 0 || this.SelectedConversation.Name !== conversation.Name)  {
            // we are on the first message so skip renamed the convo, use that
            this.SelectedConversation.Name = conversation.Name; // this will update the UI
          }

          const convoDetails = await this.LoadRecentConversationDetails(convoID, 'AI', 1);
          const aiDetail = convoDetails[0];
          if (aiDetail) {
            this.AddMessageToCurrentConversation(aiDetail, true, true);
            
            // Ensure scroll to bottom after adding AI message from status polling
            this.setTimeout(() => {
              this.scrollToBottom();
            }, 100, { purpose: 'scroll-after-ai-message' });
            
            // Automatically show artifact if the new AI message has one
            this.autoShowArtifactIfPresent(aiDetail);
            
            // Check if the conversation name was updated on the server (especially when artifacts are created)
            if (aiDetail.ArtifactID) {
              await this.syncConversationNameFromServer(conversation.ID);
            }
          }
          // NOTE: we don't create a user notification at this point, that is done on the server and via GraphQL subscriptions it tells us and we update the UI automatically...
        }

        if (this.SelectedConversation) {
          this.setProcessingStatus(this.SelectedConversation.ID, false);
        }

        const idx = this.Conversations.findIndex((c) => c.ID === convoID);
        if (idx >= 0) {
          // update our this.Conversations array to reflect the updated conversation. First find the index of the conversation and then get that item and update it
          this.Conversations[idx] = conversation;
          //rerender the list box
          this.Conversations = [...this.Conversations];
        }

        this.AllowSend = true;
        this._conversationsInProgress[convoID] = false;
        // Set processing status to false for this conversation
        this._processingStatus[convoID] = false;
        this._messageInProgress = false;

        // now tell Angular to resume its change detection
        this.cdRef.reattach();
        this.cdRef.detectChanges();
        // invoke manual resize with a delay to ensure that the scroll to bottom has taken place
        //InvokeManualResize();

        // Only clear the status message if this is the currently selected conversation
        if (convoID === this.SelectedConversation?.ID) {
          this.SetSkipStatusMessage('', 500); // slight delay to ensure that the message is removed after the UI has updated with the new response message
          // now set focus on the input box
          this.askSkipInput.nativeElement.focus();
        }
      }
    } catch (error) {
      LogError(`Error checking request status for conversation with ID ${convoID}: ${error}`);
    }
  }

  ngOnDestroy() {
    // Clean up all message subscriptions
    this.ClearMessages();
    
    // Unsubscribe to prevent memory leaks
    if (this.paramsSubscription) {
      this.paramsSubscription.unsubscribe();
    }
    if (this._intersectionObserver) {
      this._intersectionObserver.disconnect();
    }
    
    // Clear any active polling intervals
    for (const conversationId in this._requestStatusPollingIntervals) {
      this.stopRequestStatusPolling(conversationId);
    }
    
    // Unsubscribe from MJ event listeners
    if (this._mjGlobalEventSub) {
      this._mjGlobalEventSub.unsubscribe();
    }
    if (this._providerPushStatusSub) {
      this._providerPushStatusSub.unsubscribe();
    }
  }

  protected updateParentTabPanelStyling() {
    // this will update the ancestor above us that is a tabpanel to remove padding so we can control our own padding/margin and handle colors properly within the tab
    // apply a class to our parent if it is a kendo tab, to get rid of padding so we can control our
    // own padding/margin and handle colors properly within the tab

    // Find the closest ancestor with the .k-tabstrip-content class
    const ancestor = this.el.nativeElement.closest('.k-tabstrip-content');

    if (ancestor) {
      try {
        // Modify the ancestor's style as needed
        const htmlElement = <HTMLElement>ancestor;
        htmlElement.style.padding = '0';
        htmlElement.style.paddingBlock = '0';
        htmlElement.style.overflow = 'hidden';
      } catch (e) {
        // ignore this, it's not a big deal
        console.log(e);
      }
    }
  }

  public conversationResourceTypeID: string | undefined = undefined;
  public _initialLoadComplete: boolean = false;
  public _isLoading: boolean = false;
  public _numLoads: number = 0;
  public async ngAfterViewInit() {
    if (this.AutoLoad)
      await this.Load();
  }

  protected get ResourcePermissionEngine(): ResourcePermissionEngine {
    return <ResourcePermissionEngine>ResourcePermissionEngine.GetProviderInstance(this.ProviderToUse, ResourcePermissionEngine);
  }


  /**
   * This property is used to determine if the component should automatically load the data when it is first shown. Default is true. Turn this off if you want to have more control over the loading sequence and manually call the Load() method when ready.
   */
  @Input() public AutoLoad: boolean = true;
  public async Load(forceRefresh: boolean = false) {
    if (!this._initialLoadComplete || forceRefresh) {
      this.SubscribeToNotifications(); // subscribe to notifications, this auto-cleans up old subs if they exist - we do this HERE becuase the ProviderToUse is set by this point in time whereas in ngOnInit it's not necessarily set yet
      await this.ResourcePermissionEngine.Config(false, this.ProviderToUse.CurrentUser, this.ProviderToUse);
      this.conversationResourceTypeID = this.ResourcePermissionEngine.ResourceTypes.find((rt) => rt.Name === 'Conversations')?.ID;
      MJGlobal.Instance.ObjectCache.Remove('Conversations'); // clear the cache so we reload the conversations
      if (this.paramsSubscription) {
          this.paramsSubscription.unsubscribe();
      }
      this.updateParentTabPanelStyling();
      SkipChatComponent.__skipChatWindowsCurrentlyVisible = 0; // set to zero each time we are called here

      // create an intersection observer to see if we are visible
      this._intersectionObserver = new IntersectionObserver(async (entries) => {
        const [entry] = entries;
        if (!entry.isIntersecting) {
          // we are NOT visible, so decrement the count of visible instances, but only if we were ever visible, meaning sometimes we get this situation before we are ever shown
          if (this._initialLoadComplete || forceRefresh) {
            // don't go below 0
            SkipChatComponent.__skipChatWindowsCurrentlyVisible = Math.max(0, SkipChatComponent.__skipChatWindowsCurrentlyVisible - 1);
          }
        } else {
          // we are now visible, increment the count of visible instances
          SkipChatComponent.__skipChatWindowsCurrentlyVisible++;
          if (!this._initialLoadComplete || forceRefresh) {
            // we are now visible, for the first time, first fire off an InvokeManualResize to ensure the parent container is resized properly
            InvokeManualResize();
  
            // first do stuff if we're on "global" skip chat mode...
            if (this.ShowConversationList && !this.LinkedEntity && this.LinkedEntity.trim().length === 0 && !this.CompositeKeyIsPopulated()) {
              // only subscribe to the route params if we don't have a linked entity and record id, meaning we're in the context of the top level Skip Chat UI, not embedded somewhere
                this.paramsSubscription = this.route.params.subscribe(async (params) => {
                if (!this._initialLoadComplete || forceRefresh) {
                  this._initialLoadComplete = true; // do this once
                  const conversationId = params.conversationId;
                  if (conversationId) {
                    await this.loadConversations(conversationId); // Load the conversation based on the conversationId
                  } 
                  else {
                    await this.loadConversations();
                  }
                }
              });
            } else if (this.LinkedEntity && this.CompositeKeyIsPopulated()) {
              // now, do stuff if we are embedded in another component with a LinkedEntity/LinkedEntityRecordID
              if (!this._initialLoadComplete || forceRefresh) {
                this._initialLoadComplete = true; // do this once
                await this.loadConversations(); // Load the conversation which will filter by the linked entity and record id
              }
            }
  
            this.checkScroll();
          }
  
          // Only care about the first time we are visible, so unobserve here to save resources
          //this._intersectionObserver!.unobserve(this.topLevelDiv.nativeElement);
        }
      });
  
      // now fire up the observer on the top level div
      this._intersectionObserver.observe(this.topLevelDiv.nativeElement);
      this.cdRef.detectChanges();
    }
  }

  /**
   * This method is used to refresh the data in the component. This will reload the conversations and messages from the server.
   */
  public Refresh() {
    this.Load(true);
  }

  private _scrollToBottom: boolean = false;
  ngAfterViewChecked(): void {
    if (this._scrollToBottom) {
      this._scrollToBottom = false;
      // have a short delay to make sure view is fully rendered via event cycle going through its queue
      // NOTE - we only do this setTimeout if we have a scroll to bottom request, otherwise we don't need to do this, and
      // REMEMBER setTimeout() causes Angular to do a change detection cycle, so we don't want to do this unless we need to
      this.setTimeout(() => {
        this.scrollToBottom();
      }, 200, { purpose: 'scroll-after-view-check' });
    }
  }

  public FlipEmbeddedConversationState() {
    this.IncludeLinkedConversationsInList = !this.IncludeLinkedConversationsInList;
    this.loadConversations();
  }

  private static _cacheRootKey: string = '___SkipChat__'
  protected async loadConversations(conversationIdToLoad: string | undefined = undefined) {
    this._isLoading = true; 

    const cacheConversationsKey = `${SkipChatComponent._cacheRootKey}_Conversations`;
    const cacheConversationServerURLKey = `${SkipChatComponent._cacheRootKey}_ConversationsServerURL`;
    let cachedConversations = MJGlobal.Instance.ObjectCache.Find<MJConversationEntity[]>(cacheConversationsKey);
    const cacheConversationsServerURL = MJGlobal.Instance.ObjectCache.Find<string>(cacheConversationServerURLKey);
    const gqlConfig = <GraphQLProviderConfigData>this.ProviderToUse.ConfigData;

    if (!cachedConversations || gqlConfig.URL !== cacheConversationsServerURL ) {
      // load up from the database as we don't have any cached conversations
      // or we have a different URL 
      const result = await this.RunViewToUse.RunView({
        EntityName: 'MJ: Conversations',
        ExtraFilter: `UserID='${this.ProviderToUse.CurrentUser.ID}'`,
        OrderBy: '__mj_CreatedAt DESC', // get in reverse order so we have latest on top
      });
      if (result && result.Success) {
        // now, cache the conversations for future use
        MJGlobal.Instance.ObjectCache.Replace(cacheConversationsKey, result.Results); // use Replace for safety in case someone else has added to the cache between when we checked and now
        MJGlobal.Instance.ObjectCache.Replace(cacheConversationServerURLKey, gqlConfig.URL); // ensure the key for the conversations object is set to the current server URL

        // also set the local variable so we can use it below
        cachedConversations = <MJConversationEntity[]>result.Results;
      }
    }

    if (!cachedConversations) {
      LogError('Error loading conversations from the database');
      return; // we couldn't load the conversations, so just return
    }

    // now setup the array we use to bind to the UI
    if (this.IncludeLinkedConversationsInList) {
      this.Conversations = cachedConversations; // dont filter out linked conversations
    } 
    else if (this.LinkedEntity && this.LinkedEntity.length > 0 && this.CompositeKeyIsPopulated()) {
      this.Conversations = cachedConversations.filter(
        (c: MJConversationEntity) => c.LinkedEntity === this.LinkedEntity && c.LinkedRecordID === this.LinkedEntityCompositeKey.Values()
      ); // ONLY include the linked conversations
    } 
    else {
      this.Conversations = cachedConversations.filter(
        (c: MJConversationEntity) => !(c.LinkedEntity && c.LinkedEntity.length > 0 && c.LinkedRecordID && c.LinkedRecordID.length > 0)
      ); // filter OUT linked conversations
    }

    if (this.Conversations.length === 0 && !conversationIdToLoad) {
      // no conversations, so create a new one, BUT ONLY IF we weren't asked to load a specific conversation
      // that can happen when a given user doesn't have their own conversations, but they are trying to view a shared conversation
      await this.CreateNewConversation();
      InvokeManualResize(1);
    } 
    else if (conversationIdToLoad) {
      // we are being asked to load a specific conversation
      const convo = this.Conversations.find((c) => c.ID == conversationIdToLoad);
      if (convo) {
        await this.SelectConversation(convo);
      } 
      else {
        // we didn't find the conversation so check to see if it exists at all, could be a shared conversation
        const sharedConvo = await this.LoadSingleConversation(conversationIdToLoad);
        if (sharedConvo) {
          await this.SelectConversation(sharedConvo);
        }
        else {
          // no shared conversation, load the first conversation but alert user that the convo they tried to load isn't available
          this.notificationService.CreateSimpleNotification(`Conversation ${conversationIdToLoad} not found`, 'error', 5000);
          if (this.Conversations.length > 0) {
            await this.SelectConversation(this.Conversations[0]);
          }
          else {
            await this.CreateNewConversation();
          }
        }
      }
    } 
    else {
      // select the first conversation since no param was provided and we have > 0 convos
      await this.SelectConversation(this.Conversations[0]);
    }

    // Update UI for conversations that are processing
    this.checkForProcessingConversations();

    this._isLoading = false;
    this._numLoads++;
  }

  /**
   * Loads a conversation from the database based on the conversation ID provided.
   * @param conversationId 
   * @returns 
   */
  public async LoadSingleConversation(conversationId: string): Promise<MJConversationEntity | undefined> {
    const rv = new RunView(this.RunViewToUse);
    const result = await rv.RunView<MJConversationEntity>({
      EntityName: 'MJ: Conversations',
      ExtraFilter: `ID='${conversationId}'`,
      ResultType: 'entity_object'
    });
    if (result && result.Success) {
      return result.Results[0];
    }
  }

  private _oldConvoName: string = '';
  public editConvo(conversation: MJConversationEntity) {
    this._oldConvoName = conversation.Name ? conversation.Name : '';
    this.ConversationEditMode = true;
  }

  public cancelConvoEdit(conversation: MJConversationEntity) {
    conversation.Name = this._oldConvoName;
    this.ConversationEditMode = false;
  }

  public async saveConvoName(conversation: MJConversationEntity) {
    let newConvoObject: MJConversationEntity;
    if (conversation.Save !== undefined) {
      newConvoObject = conversation;
    } 
    else {
      const p = this.ProviderToUse;
      newConvoObject = await p.GetEntityObject('MJ: Conversations', p.CurrentUser);
      await newConvoObject.Load(conversation.ID);
      // now replace conversation in the list with the new object
      this.Conversations = this.Conversations.map((c) => (c.ID == conversation.ID ? newConvoObject : c));
    }
    newConvoObject.Name = conversation.Name;
    if (await newConvoObject.Save()) {
      this.ConversationEditMode = false;
      // we've already updated the bound UI element, but let's make sure to update the cache as well
      const cachedConversations = MJGlobal.Instance.ObjectCache.Find<MJConversationEntity[]>('Conversations');
      if (cachedConversations) {
        // find the item in the cache
        const idx = cachedConversations.findIndex((c) => c.ID === conversation.ID);
        if (idx >= 0) {
          // replace the item in the cache with the new one, we are pointing to the same object in the cache here since
          // we are just updating an element within the array so don't need to tell the cache
          cachedConversations[idx] = newConvoObject;
        }
      }
    } 
    else 
      this.notificationService.CreateSimpleNotification('Error saving conversation name', 'error', 5000);
  }

  public confirmDeleteConversationDialogOpen: boolean = false;
  private _conversationToDelete: MJConversationEntity | undefined;
  public async showDeleteConvoDialog(conversation: MJConversationEntity) {
    this.confirmDeleteConversationDialogOpen = true;
    this._conversationToDelete = conversation;
  }
  public async closeDeleteConversation(yesno: 'yes' | 'no') {
    this.confirmDeleteConversationDialogOpen = false;
    if (this._conversationToDelete && yesno === 'yes') 
      await this.deleteConvo(this._conversationToDelete);
  }

  public async deleteConvo(conversation: MJConversationEntity) {
    // delete the conversation - we might need to load the entity if the current object isn't a "real object"
    if (await this.DeleteConversation(conversation.ID)) {
      // we need to remove the conversation from the request status polling
      this.stopRequestStatusPolling(conversation.ID);
      // get the index of the conversation
      const idx = this.Conversations.findIndex((c) => c.ID === conversation.ID);
      // remove the conversation from the list that is bound to the UI
      this.Conversations = this.Conversations.filter((c) => c.ID != conversation.ID);

      // also, remove the conversation from the cache
      const cachedConversations = MJGlobal.Instance.ObjectCache.Find<MJConversationEntity[]>('Conversations');
      if (cachedConversations) {
        MJGlobal.Instance.ObjectCache.Replace(
          'Conversations',
          cachedConversations.filter((c) => c.ID != conversation.ID)
        );
      } else {
        MJGlobal.Instance.ObjectCache.Add('Conversations', this.Conversations);
      }

      if (this.Conversations.length > 0) {
        const newIdx = idx > 0 ? idx - 1 : 0;
        this.SelectConversation(this.Conversations[newIdx]);
      } 
      else {
        // When deleting the last conversation, create a new empty one
        // This provides a better UX than showing just a loading spinner
        await this.CreateNewConversation();
      }
    } 
    else {
      this.notificationService.CreateSimpleNotification('Error deleting conversation', 'error', 5000);
    }
  }

  public async CreateNewConversation() {
    const p = this.ProviderToUse;
    const convo = await p.GetEntityObject<MJConversationEntity>('MJ: Conversations', p.CurrentUser);
    convo.NewRecord();
    convo.Name = 'New Chat'; // default value
    convo.UserID = p.CurrentUser.ID;
    convo.Type = 'skip';
    convo.IsArchived = false;
    const linkedEntityID = this.LinkedEntityID;
    if (linkedEntityID && linkedEntityID.length > 0 && this.CompositeKeyIsPopulated()) {
      convo.LinkedEntityID = linkedEntityID;
      convo.LinkedRecordID = this.LinkedEntityCompositeKey.Values();
    }
    // next, create a new data context for this conversation
    const dc = await p.GetEntityObject<MJDataContextEntity>('MJ: Data Contexts', p.CurrentUser);
    dc.NewRecord();
    dc.Name = 'Data Context for Skip Conversation';
    dc.UserID = p.CurrentUser.ID;
    if (await dc.Save()) {
      // now create a data context item for the linked record if we have one
      if (this.LinkedEntityID && this.LinkedEntityID.length > 0 && this.CompositeKeyIsPopulated()) {
        const dci = await p.GetEntityObject<MJDataContextItemEntity>('MJ: Data Context Items', p.CurrentUser);
        dci.NewRecord();
        dci.DataContextID = dc.ID;
        if (this.LinkedEntity === 'MJ: User Views') {
          dci.Type = 'view';
          dci.ViewID = this.LinkedEntityCompositeKey.GetValueByIndex(0);
        } else if (this.LinkedEntity === 'Queries') {
          dci.Type = 'query';
          dci.QueryID = this.LinkedEntityCompositeKey.GetValueByIndex(0);
        } else {
          dci.Type = 'single_record';
          dci.RecordID = this.LinkedEntityCompositeKey.Values();
          dci.EntityID = this.LinkedEntityID;
        }
        let dciSaveResult: boolean = await dci.Save();
        if (!dciSaveResult) {
          this.notificationService.CreateSimpleNotification('Error creating data context item', 'error', 5000);
          LogError('Error creating data context item', undefined, dci.LatestResult);
        }
      }

      convo.DataContextID = dc.ID;
      this.DataContextID = dc.ID;
      const convoSaveResult: boolean = await convo.Save();
      if (!convoSaveResult) {
        this.notificationService.CreateSimpleNotification('Error creating conversation', 'error', 5000);
        LogError('Error creating conversation', undefined, convo.LatestResult);
        return;
      }

      this.DataContext = new DataContext();
      await this.DataContext.LoadMetadata(this.DataContextID, p.CurrentUser, p);

      this.Conversations = [convo, ...this.Conversations]; // do this way instead of unshift to ensure that binding refreshes
      // also update the cache
      const cachedConversations = MJGlobal.Instance.ObjectCache.Find<MJConversationEntity[]>('Conversations');
      if (cachedConversations) {
        MJGlobal.Instance.ObjectCache.Replace('Conversations', [convo, ...cachedConversations]);
      } else {
        MJGlobal.Instance.ObjectCache.Add('Conversations', [convo, ...this.Conversations]);
      }
      await this.SelectConversation(convo);
      // Ensure scroll to bottom for new conversation
      this.setTimeout(() => {
        this.scrollToBottom();
      }, 100, { purpose: 'scroll-new-conversation' });
    } else {
      this.notificationService.CreateSimpleNotification('Error creating data context', 'error', 5000);
    }
  }

  onEnter(event: any) {
    this.sendSkipMessage();
  }

  /**
   * This method returns true if the specified user can access the conversation provided, otherwise false.
   * @param conversation 
   */
  public async UserCanAccessConversation(user: UserInfo, conversation: MJConversationEntity): Promise<boolean> {
    if (!this.conversationResourceTypeID) {
      LogError('Resource type ID for conversations is not loaded - metadata loading error');
      return false;
    }

    if (!user || !conversation) {
      return false;
    }
    else {
      if (conversation.UserID === user.ID) {
        return true;
      }
      else {
        const level = await this.GetUserConversationPermissionLevel(user, conversation);
        return level !== null;
      }
    }
  }

  /**
   * Returns the permission level of the user for the conversation provided.
   * @param user 
   * @param conversation 
   * @returns 
   */
  public async GetUserConversationPermissionLevel(user: UserInfo, conversation: MJConversationEntity): Promise<"View" | "Edit" | "Owner" | null> {
    if (!this.conversationResourceTypeID) {
      LogError('Resource type ID for conversations is not loaded - metadata loading error');
      return null;
    }
    else {
      if (user.ID === conversation.UserID) {
        return 'Owner'
      }
      else {
        // check resource permissions for sharing
        const engine = this.ResourcePermissionEngine;
        await engine.Config(false, this.ProviderToUse.CurrentUser, this.ProviderToUse);
        return  engine.GetUserResourcePermissionLevel(this.conversationResourceTypeID, conversation.ID, user);
      }
    }
  }

  public SelectedConversationCurrentUserPermissionLevel: "View" | "Edit" | "Owner" | null = null;

  /**
   * Sets the currently displayed conversation to the one provided
   * @param conversation 
   * @returns 
   */
  public async SelectConversation(conversation: MJConversationEntity) {
    
      // load up the conversation if not already the one that's loaded
    if (conversation && conversation.ID !== this.SelectedConversation?.ID) {
      // check to see if the user has access to the conversation
      if (!await this.UserCanAccessConversation(this.ProviderToUse.CurrentUser, conversation)) {
        this.notificationService.CreateSimpleNotification(`You do not have access to conversation ${conversation.ID}`, 'error', 5000);
        if (!this.SelectedConversation) {
          if (this.Conversations.length > 0) {
            // no current convo selected, so select the first one in the list
            const currentIndex: number = this.Conversations.findIndex((c) => c.ID === conversation.ID);
            if (currentIndex >= 0) {
              // select the next one in the list
              await this.SelectConversation(this.Conversations[currentIndex + 1]);
            }
            else {
              // select the first one in the list
              await this.SelectConversation(this.Conversations[0]);
            }
          }
          else {
            // doesn't have any conversations, so create a new one
            await this.CreateNewConversation();
          }
        }
        return;
      }

      this.selectedArtifact = null;
      this.SelectedConversationCurrentUserPermissionLevel = await this.GetUserConversationPermissionLevel(this.ProviderToUse.CurrentUser, conversation);
      this._conversationLoadComplete = false;
      this.ClearMessages();
      const oldStatus = this.IsSkipProcessing(conversation);
      this.setProcessingStatus(conversation.ID, true);
      this.SelectedConversation = conversation;
      this.SetSelectedConversationUser();
      this.DataContextID = conversation.DataContextID ? conversation.DataContextID : '';

      const convoAny = <any>conversation;
      if (convoAny._DataContext) {
        // we have cached data context, so just use it
        this.DataContext = convoAny._DataContext;
      } else {
        this.DataContext = new DataContext();
        await this.DataContext.LoadMetadata(this.DataContextID, this.ProviderToUse.CurrentUser, this.ProviderToUse);
        // cache it for later
        convoAny._DataContext = this.DataContext;
      }

      const convoShouldReload = this._conversationsToReload[conversation.ID];
      if (convoAny._Messages && !convoShouldReload) {
        // we have cached messages, so just use them, but don't point directly to the array, create new array with the same objects
        this.Messages = [...convoAny._Messages];
      } 
      else {
        this._conversationsToReload[conversation.ID] = false; // reset this flag since we're reloading from the DB right now

        const start = new Date().getTime();
        const result = await this.RunViewToUse.RunView<MJConversationDetailEntity>({
          EntityName: 'MJ: Conversation Details',
          ExtraFilter: `ConversationID='${conversation.ID}'`,
          OrderBy: '__mj_CreatedAt ASC' // show messages in order of creation,
        });
        LogStatus('Skip Chat: Time to load messages from database: ' + (new Date().getTime() - start) + 'ms');

        if (result && result.Success) {
          // copy the results into NEW objects into the array, we don't want to modify the original objects
          this.Messages = result.Results;

          // also, cache the messages within the conversation, but create new array with the same objects
          convoAny._Messages = [...this.Messages];
        }
      }

      if (this.Messages && this.Messages.length > 0) {
        this.cdRef.detach(); // temporarily stop change detection to improve performance
        for (const m of this.Messages) {
          this.AddMessageToPanel(m, false);
        }
        this.cdRef.reattach(); // resume change detection
        
        // Force scroll to bottom after rendering messages
        this.setTimeout(() => {
          this.scrollToBottom();
        }, 300, { purpose: 'scroll-after-messages-render' }); // Give DOM time to render all messages
      }

      this.setProcessingStatus(conversation.ID, oldStatus); // set back to old status as it might have been processing
      
      // Check if this conversation is actually processing (regardless of DB status)
      if (conversation.Status === 'Processing' || this._conversationsInProgress[conversation.ID]) {
        
        // This conversation is currently being processed
        this.setProcessingStatus(conversation.ID, true);
        this._conversationsInProgress[conversation.ID] = true;
        this._messageInProgress = true;
        this.AllowSend = false;
        
        // Check if we have a cached status message (from before reload)
        const cachedStatus = this._statusMessagesByConversation[conversation.ID];
        
        if (!cachedStatus && conversation.Status === 'Processing') {
          // Show a default message immediately while we fetch the real status
          this.SetSkipStatusMessage("Processing...", 0, conversation.__mj_UpdatedAt);
          
          // After a page reload or when switching to a conversation without cached status,
          // request the current status from the backend and update when ready
          this.requestCurrentConversationStatus(conversation.ID).then(() => {
            // After getting the status from backend, update the message with the correct start time
            const updatedStatus = this._statusMessagesByConversation[conversation.ID];
            if (updatedStatus) {
              this.SetSkipStatusMessage(updatedStatus.message, 0, updatedStatus.startTime);
            }
            // Start polling after getting the real status
            this.startRequestStatusPolling(conversation.ID);
          });
        } else {
          // We have cached status, use it directly and immediately
          const statusMessage = cachedStatus?.message || "Processing...";
          const statusStartTime = cachedStatus?.startTime || conversation.__mj_UpdatedAt;
          
          // Set the status message immediately since we have cached data
          this.SetSkipStatusMessage(statusMessage, 0, statusStartTime);
          // Start polling immediately
          this.startRequestStatusPolling(conversation.ID);
        }
      } else {
        // Conversation is not processing
      }
      
      InvokeManualResize(500);

      // ensure the list box has the conversation in view
      this.scrollToConversation(conversation.ID);

      this._conversationLoadComplete = true;

      if (this.UpdateAppRoute) {
        // finally update the browser URL since we've changed the conversation ID
        this.location.go('/askskip/' + conversation.ID);
      }

      this.cdRef.detectChanges(); // first this off since conversation changed
      this.ConversationSelected.emit(conversation.ID);
    }
  }

  protected scrollToConversation(conversationId: string): void {
    if (this.conversationList) {
      const convoElement = this.conversationList.element.nativeElement;
      const itemIndex = this.Conversations.findIndex((c) => c.ID === conversationId);
      // Find the item element within the container based on its index
      const itemElement = Array.from(convoElement.querySelectorAll('[data-kendo-listview-item-index]') as NodeListOf<HTMLElement>).find(
        (el: HTMLElement) => parseInt(el.getAttribute('data-kendo-listview-item-index')!, 10) === itemIndex
      );

      if (itemElement) {
        this.setTimeout(() => {
          // do this within a timeout to ensure rendering is completed
          itemElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
        }, 100);
      }
    }
  }

  onInputChange(event: any) {
    const val = this.askSkipInput.nativeElement.value;
    this.AllowSend = val && val.length > 0;
    this.resizeTextInput();
  }

  resizeTextInput() {
    try {
      const textarea = this.askSkipInput.nativeElement;
      textarea.style.height = 'auto'; // Reset height to recalculate
      textarea.style.height = `${textarea.scrollHeight}px`; // Set to scrollHeight
    } catch (e) {
      LogError(e);
    }
  }

  private static _startMessages = [
    'On it, let me get back to you in a moment with the results!🤖',
    "I'm on it, just a moment! 🙂",
    "I'll get started in a jiffy!",
    "You bet, I'd love to help, give me a moment!",
    "I understand, I'll start running in that direction 👟",
    "No problem, I'll get started right away!",
    "Ok, heard loud and clear, I'll jump right on it! 👂",
    "Aye aye captain, I'll get started right away! ⚓",
  ];
  private _usedStartMessages: string[] = [];
  private pickSkipStartMessage() {
    // goal here is to randomly select one of the above _startMessages, however we want to track for our instance of the class the ones we use so that we don't reuse any of them until we use them all
    if (this._usedStartMessages.length === SkipChatComponent._startMessages.length) {
      this._usedStartMessages = []; // reset the used messages
    }
    let idx = -1;
    do {
      idx = Math.floor(Math.random() * SkipChatComponent._startMessages.length);
    } while (this._usedStartMessages.indexOf(SkipChatComponent._startMessages[idx]) >= 0);
    this._usedStartMessages.push(SkipChatComponent._startMessages[idx]);
    return SkipChatComponent._startMessages[idx];
  }

  protected setProcessingStatus(conversationId: string, status: boolean) {
    if (conversationId) {
      this._processingStatus[conversationId] = status;
      // if the current conversation, update the panel messages so they know we've changed our processing state
      if (this.SelectedConversation && this.SelectedConversation.ID === conversationId) {
        this.UpdateAllPanelMessages();
      }  
    }
  }

  public async sendPrompt(val: string) {
    const convoID: string = this.SelectedConversation ? this.SelectedConversation.ID : '';
    if (this._conversationsInProgress[convoID]) {
      // don't allow sending another message if we're in the midst of sending one
      return;
    }

    if (this.SelectedConversation) {
      this.setProcessingStatus(this.SelectedConversation?.ID, true);
    }

    if (val && val.length > 0) {
      this._conversationsInProgress[convoID] = true;
      this._messageInProgress = true;
      this.AllowSend = false;
      const p = this.ProviderToUse;
      const convoDetail = <MJConversationDetailEntity>await p.GetEntityObject('MJ: Conversation Details', p.CurrentUser);
      convoDetail.NewRecord();
      convoDetail.Message = val;
      convoDetail.Role = 'User';
      // this is NOT saved here because it is saved on the server side. Later on in this code after the save we will update the object with the ID from the server, and below
      this.AddMessageToCurrentConversation(convoDetail, true, true);

      this.askSkipInput.nativeElement.value = '';
      this.resizeTextInput();

      // Store the start time when first creating the status message
      const startTime = new Date();
      const statusMessage = this.pickSkipStartMessage();
      if (convoID) {
        this._statusMessagesByConversation[convoID] = {
          message: statusMessage,
          startTime: startTime
        };
      }

      this.SetSkipStatusMessage(statusMessage, 850, startTime);
      
      // Ensure scroll to bottom after adding user message AND progress message
      this.setTimeout(() => {
        this.scrollToBottom();
      }, 950, { purpose: 'scroll-after-user-message' }); // Slightly after the progress message is shown (850ms + 100ms buffer)

      const graphQLRawResult = await this.ExecuteAskSkipQuery(val, await this.GetCreateDataContextID(), this.SelectedConversation);
      const skipResult = <MJAPISkipResult>graphQLRawResult?.ExecuteAskSkipAnalysisQuery;
      // temporarily ask Angular to stop its change detection as many of the ops below are slow and async, we don't want flicker in the UI as stuff happens
      this.cdRef.detach();
      if (skipResult?.Success) {
        if (convoID !== this.SelectedConversation?.ID) {
          // this scenario arises when we have a selected convo change after we submitted our request to skip
          // so we just mark it for reload, don't update processing status
          //the next time the user selects this convo, we will fetch messages
          //from the server rather than using the ones in cache
          this._conversationsToReload[convoID] = true;
        } 
        else {
          // Only update processing status for the selected conversation
          this.setProcessingStatus(convoID, false);
          const innerResult: SkipAPIResponse = JSON.parse(skipResult.Result);

          if (!this.SelectedConversation) {
            const convo = <MJConversationEntity>await p.GetEntityObject('MJ: Conversations', p.CurrentUser);
            await convo.Load(skipResult.ConversationId);
            this.setProcessingStatus(skipResult.ConversationId, true);
            this.Conversations.push(convo);
            this.SelectedConversation = convo;
            this.cdRef.detectChanges(); // first this off since conversation changed
            this.SetSelectedConversationUser();
          } 
          else if (innerResult.responsePhase === SkipResponsePhase.analysis_complete) {
            if (this.SelectedConversation.Name === 'New Chat' || this.SelectedConversation.Name?.trim().length === 0 )  {
              // we are on the first message so skip renamed the convo, use that
              this.SelectedConversation.Name = (<SkipAPIAnalysisCompleteResponse>innerResult).title!; // this will update the UI

              // the below LOOKS redundant to just updating this.SelectedConversation.Name, but it is needed to ensure that the list box is updated
              // otherwise Angular binding doesn't pick up the change without the below.
              const idx = this.Conversations.findIndex((c) => c.ID === this.SelectedConversation?.ID);
              if (idx >= 0) {
                // update our this.Conversations array to reflect the new name. First find the index of the conversation and then get that item and update it
                this.Conversations[idx].Name = this.SelectedConversation.Name;
                //reredner the list box
                this.Conversations = [...this.Conversations];
              }
            }
          }

          await convoDetail.Load(skipResult.UserMessageConversationDetailId); // update the object to load from DB
          const aiDetail = <MJConversationDetailEntity>await p.GetEntityObject('MJ: Conversation Details', p.CurrentUser);
          await aiDetail.Load(skipResult.AIMessageConversationDetailId); // get record from the database
          this.AddMessageToCurrentConversation(aiDetail, true, true);
          
          // Ensure scroll to bottom after AI response
          this.setTimeout(() => {
            this.scrollToBottom();
          }, 100, { purpose: 'scroll-after-ai-response' });
          
          // Automatically show artifact if the new AI message has one
          this.autoShowArtifactIfPresent(aiDetail);
          
          // Check if the conversation name was updated on the server (especially when artifacts are created)
          if (aiDetail.ArtifactID) {
            await this.syncConversationNameFromServer(this.SelectedConversation.ID);
          }
          // NOTE: we don't create a user notification at this point, that is done on the server and via GraphQL subscriptions it tells us and we update the UI automatically...
        }
      }

      // Only update processing status if this is the currently selected conversation
      if (this.SelectedConversation && this.SelectedConversation.ID === convoID) {
        this.setProcessingStatus(this.SelectedConversation.ID, false);
      }

      this.AllowSend = true;
      this._conversationsInProgress[convoID] = false;
      // Set processing status to false for this conversation
      this._processingStatus[convoID] = false;
      this._messageInProgress = false;

      // now tell Angular to resume its change detection
      this.cdRef.reattach();
      this.cdRef.detectChanges();
      // invoke manual resize with a delay to ensure that the scroll to bottom has taken place
      //InvokeManualResize();

      // Only clear the status message if this is the currently selected conversation
      if (convoID === this.SelectedConversation?.ID) {
        this.SetSkipStatusMessage('', 500); // slight delay to ensure that the message is removed after the UI has updated with the new response message
        // now set focus on the input box
        this.askSkipInput.nativeElement.focus();
      }
    }
  }

  public async sendSkipMessage() {
    if(this.IsTextAreaEmpty()){
      return;
    }

    const input: string = this.askSkipInput.nativeElement.value;
    await this.sendPrompt(input);
  }

  public ClearMessages() {
    // Clean up all message subscriptions before clearing
    if (this.Messages && this.Messages.length > 0) {
      this.Messages.forEach((message) => {
        const subscriptions = (<any>message)._subscriptions;
        if (subscriptions && Array.isArray(subscriptions)) {
          subscriptions.forEach((sub: any) => {
            if (sub && sub.unsubscribe) {
              sub.unsubscribe();
            }
          });
          (<any>message)._subscriptions = [];
        }
      });
    }
    
    this.Messages = []; // clear out the messages
    
    // Clear the temporary message reference (but keep the cached ones)
    this._temporaryMessage = undefined;

    // Get the first mjContainer in the DOM which is the one we're injecting into
    const containerElements = document.querySelectorAll('div[mjContainer]');
    if (containerElements && containerElements.length > 0) {
      // find component instance referenced by the container element
      const componentEl = containerElements[0];
      const componentInstance = this.askSkip ? this.askSkip : undefined;
      
      // clear out the container if we have a reference to it
      if (componentInstance && componentInstance.viewContainerRef) {
        componentInstance.viewContainerRef.clear();
      }
    }
  }
  public AddMessageToCurrentConversation(detail: MJConversationDetailEntity, stopChangeDetection: boolean, cacheMessage: boolean) {
    // update the local binding for the UI
    if (this.Messages.find((m) => m.ID === detail.ID) || this.Messages.find(m => m === detail)) {
      // we already have this message, so don't add it again
      return;
    }

    this.Messages.push(detail);
    if (cacheMessage) {
      // update the cache of messages for the selected conversation
      const convo = this.SelectedConversation;
      if (convo) {
        const convoAny = <any>convo;
        if (convoAny._Messages) {
          convoAny._Messages.push(detail);
        } else {
          convoAny._Messages = [detail];
        }
      }
    }

    // dynamically add the message to the panel
    this.AddMessageToPanel(detail, stopChangeDetection);
  }
  public RemoveMessageFromCurrentConversation(detail: MJConversationDetailEntity) {
    // update the local binding for the UI
    this.Messages = this.Messages.filter((m) => m !== detail);

    // update the cache of messages for the selected conversation
    const convo = this.SelectedConversation;
    if (convo) {
      const convoAny = <any>convo;
      if (convoAny._Messages) {
        convoAny._Messages = convoAny._Messages.filter((m: MJConversationDetailEntity) => m.ID !== detail.ID);
      }
    }

    // dynamically remove the message from the panel
    this.RemoveMessageFromPanel(detail);
  }

  // method to dynamically remove a message
  protected RemoveMessageFromPanel(messageDetail: MJConversationDetailEntity) {
    const ref = (<any>messageDetail)._componentRef;
    if (ref) {
      // Temporarily stop change detection for performance
      this.cdRef.detach();

      // Clean up subscriptions before destroying the component
      const subscriptions = (<any>messageDetail)._subscriptions;
      if (subscriptions && Array.isArray(subscriptions)) {
        subscriptions.forEach((sub: any) => {
          if (sub && sub.unsubscribe) {
            sub.unsubscribe();
          }
        });
        (<any>messageDetail)._subscriptions = [];
      }

      const index = this.askSkip.viewContainerRef.indexOf(ref.hostView);
      if (index !== -1) {
        this.askSkip.viewContainerRef.remove(index);
      }

      // Resume change detection
      this.cdRef.reattach();
    }
  }

  protected UpdatePanelMessage(messageDetail: MJConversationDetailEntity, invokeChangeDetection: boolean = true) {
    const ref = (<any>messageDetail)._componentRef;
    if (ref) {
      const obj = <SkipSingleMessageComponent>ref.instance;
      obj.ConversationMessages = this.Messages; // update this so it can handle its rendering appropriately
      obj.ConversationProcessing = this.IsSkipProcessing(this.SelectedConversation!); // update this so it can handle its rendering appropriately

      if (invokeChangeDetection) {
        this.cdRef.markForCheck();
      }
    }
  }

  protected UpdateAllPanelMessages() {
    if (this.Messages && this.Messages.length > 0) {
      this.Messages.forEach((m) => {
        this.UpdatePanelMessage(m, false);
      });
      this.cdRef.markForCheck();  
    }
  }

  // Method to dynamically add a message
  protected AddMessageToPanel(messageDetail: MJConversationDetailEntity, stopChangeDetection: boolean) {
    // Temporarily stop change detection for performance
    if (stopChangeDetection) this.cdRef.detach();

    const componentRef = this.askSkip.viewContainerRef.createComponent(SkipSingleMessageComponent);

    // Pass the message details to the component instance
    const obj = componentRef.instance;

    // Store subscriptions so we can clean them up later
    const subscriptions: any[] = [];

    // bubble up events from the single message component to the parent component
    subscriptions.push(obj.NavigateToMatchingReport.subscribe((reportId: string) => {
      this.NavigateToMatchingReport.emit(reportId);
    }));
    subscriptions.push(obj.NewReportCreated.subscribe((reportId: string) => {
      this.NewReportCreated.emit(reportId);
    }));
    subscriptions.push(obj.DeleteMessageRequested.subscribe((message: MJConversationDetailEntity) => {
      this.HandleMessageDeleteRequest(message);
    }));
    subscriptions.push(obj.EditMessageRequested.subscribe((message: MJConversationDetailEntity) => {
      this.HandleMessageEditRequest(message);
    }));
    subscriptions.push(obj.DrillDownEvent.subscribe((drillDownInfo: DrillDownInfo) => {
      this.DrillDownEvent.emit(drillDownInfo);
    }));
    subscriptions.push(obj.ArtifactSelected.subscribe((artifact: any) => {
      this.onArtifactSelected(artifact);
    }));

    obj.Provider = this.ProviderToUse;
    obj.SkipMarkOnlyLogoURL = this.SkipMarkOnlyLogoURL;
    obj.UserImage = this.UserImage;
    obj.ConversationRecord = this.SelectedConversation!;
    obj.ConversationDetailRecord = messageDetail;
    obj.DataContext = this.DataContext;
    obj.ConversationUser = this.SelectedConversationUser!;
    obj.ConversationMessages = this.Messages; // pass this on so that the single message has access to the full conversation, for example to know if it is the first/last/only message in the conversation/etc
    if (<any>messageDetail.ID === -1 && messageDetail.__mj_CreatedAt) {
      obj.loadTime = messageDetail.__mj_CreatedAt;
    }

    // bind the processing status to the component
    obj.ConversationProcessing = this.IsSkipProcessing(this.SelectedConversation!); 

    // Whenever the suggested question is clicked on by the user in the single message component, we want to bubble that up here and send the prompt
    subscriptions.push(obj.SuggestedQuestionSelected.subscribe((question: string) => {
      this.sendPrompt(question);
    }));
    // Whenever the suggested answer is clicked on by the user in the single message component, we want to bubble that up here and send the prompt
    subscriptions.push(obj.SuggestedAnswerSelected.subscribe((answer: string) => {
      this.sendPrompt(answer);
    }));

    // now, stash a link to our newly created componentRef inside the messageDetail so we know which componentRef to remove when we delete the message
    (<any>messageDetail)._componentRef = componentRef;
    // Store subscriptions so we can clean them up when the message is removed
    (<any>messageDetail)._subscriptions = subscriptions;

    // Resume change detection
    if (stopChangeDetection) 
      this.cdRef.reattach();
  }

  checkScroll() {
    if (this.scrollContainer) {
      const element = this.scrollContainer.nativeElement;
      const buffer = 15; // Tolerance in pixels

      // Calculate the difference between the scroll height and the sum of scroll top and client height
      const scrollDifference = element.scrollHeight - (element.scrollTop + element.clientHeight);

      // Only show the icon if there's actually content to scroll (more than the viewport height)
      const hasScrollableContent = element.scrollHeight > element.clientHeight + 50; // 50px as minimum scrollable content

      // Consider it at the bottom if the difference is less than or equal to the buffer
      const atBottom = scrollDifference <= buffer;

      // Only show the icon if not at bottom AND has enough content to scroll
      this._showScrollToBottomIcon = !atBottom && hasScrollableContent;
    }
  }

  scrollToBottom(retryCount: number = 0): void {
    try {
      if (!this.scrollContainer) {
        // If scrollContainer is not available yet, retry
        if (retryCount < 10) {
          this.setTimeout(() => {
            this.scrollToBottom(retryCount + 1);
          }, 50, { purpose: 'scroll-retry', retryCount });
        }
        return;
      }
      
      const element = this.scrollContainer.nativeElement;
      if (element.scrollHeight === 0 && retryCount < 10) {
        // If scrollHeight is 0, the content hasn't rendered yet, so retry after a delay
        // But limit retries to prevent infinite loops
        this.setTimeout(() => {
          this.scrollToBottom(retryCount + 1);
        }, 50, { purpose: 'scroll-retry-no-content', retryCount });
      } else if (element.scrollHeight > 0) {
        element.scrollTop = element.scrollHeight;
      }
    } catch (err) {
      console.error('Error scrolling to bottom:', err);
    }
  }

  scrollToBottomAnimate() {
    if (this.scrollContainer) {
      const element = this.scrollContainer.nativeElement;
      element.scroll({ top: element.scrollHeight, behavior: 'smooth' });
    }
  }

  /**
   * Calculates the horizontal position for the scroll-to-bottom icon
   * to center it within the conversation panel
   */
  getScrollToBottomIconPosition(): number {
    if (!this.scrollContainer) {
      return window.innerWidth / 2; // Fallback to viewport center
    }
    
    const rect = this.scrollContainer.nativeElement.getBoundingClientRect();
    // Calculate the center of the conversation panel
    return rect.left + (rect.width / 2);
  }

  protected async GetCreateDataContextID(): Promise<string> {
    // temporary hack for now, we will have more functionality to do robust UX around DataCOntext viewing and editing soon
    // and get rid of this
    if (!this.DataContextID && this.SelectedConversation) {
      // need to create a data context
      // add to the new data context a single item for the passed in linked record, which could be a query, view, or something else
      const p = this.ProviderToUse;
      const dc = await p.GetEntityObject<MJDataContextEntity>('MJ: Data Contexts', p.CurrentUser);
      dc.NewRecord();
      const e = p.Entities.find((e) => e.Name === this.LinkedEntity);
      dc.Name =
        'Data Context for Skip Conversation ' + (e ? ' for ' + e.Name + ' - Record ID: ' + this.LinkedEntityCompositeKey.Values() : '');
      dc.UserID = p.CurrentUser.ID;
      if (await dc.Save()) {
        this.DataContextID = dc.ID;

        // update the conversation with the data context id
        const convo = await p.GetEntityObject<MJConversationEntity>('MJ: Conversations', p.CurrentUser);
        await convo.Load(this.SelectedConversation.ID);
        await convo.Save(); // save to the database
        this.SelectedConversation.DataContextID = dc.ID; // update the in-memory object

        if (this.LinkedEntity && this.CompositeKeyIsPopulated() && e) {
          // now create a single data context item for the new data context
          let type: 'view' | 'sql' | 'query' | 'single_record' | 'full_entity';
          switch (e.Name.trim().toLowerCase()) {
            case 'user views':
              type = 'view';
              break;
            case 'queries':
              type = 'query';
              break;
            default:
              if (this.CompositeKeyIsPopulated()) {
                type = 'single_record';
              } else type = 'full_entity';
              break;
          }
          const dci = await p.GetEntityObject<MJDataContextItemEntity>('MJ: Data Context Items', p.CurrentUser);
          dci.NewRecord();
          dci.DataContextID = dc.ID;
          dci.Type = type;
          if (type === 'view') dci.ViewID = this.LinkedEntityCompositeKey.GetValueByIndex(0);
          else if (type === 'query') dci.QueryID = this.LinkedEntityCompositeKey.GetValueByIndex(0);
          else if (type === 'single_record') {
            dci.RecordID = this.LinkedEntityCompositeKey.Values();
            dci.EntityID = e.ID;
          } else if (type === 'full_entity') dci.EntityID = e.ID;

          if (!(await dci.Save())) {
            this.notificationService.CreateSimpleNotification('Error creating data context item', 'error', 5000);
            console.log('AskSkipComponent: Error creating data context item');
          }
        }
      } else {
        this.notificationService.CreateSimpleNotification('Error creating data context', 'error', 5000);
        console.log('AskSkipComponent: Error creating data context');
      }
    }
    if (!this.DataContext) {
      // load the actual data context object
      this.DataContext = new DataContext();
      await this.DataContext.LoadMetadata(this.DataContextID, this.ProviderToUse.CurrentUser, this.ProviderToUse);
    }
    return this.DataContextID;
  }

  async ExecuteAskSkipQuery(question: string, dataContextId: string, SelectedConversation: MJConversationEntity | undefined) {
    try {
      const gql = `query ExecuteAskSkipAnalysisQuery($userQuestion: String!, $dataContextId: String!, $conversationId: String!) {
        ExecuteAskSkipAnalysisQuery(UserQuestion: $userQuestion, DataContextId: $dataContextId, ConversationId: $conversationId) {
          Success
          Status
          Result
          ConversationId
          UserMessageConversationDetailId
          AIMessageConversationDetailId
        }
      }`;
      const gqlProvider = this.ProviderToUse as GraphQLDataProvider;
      const result = await gqlProvider.ExecuteGQL(gql, {
        userQuestion: question,
        conversationId: SelectedConversation ? SelectedConversation.ID : '',
        dataContextId: dataContextId,
      });

      return result;
    } catch (err) {
      LogError('Error executing AskSkip query', undefined, err);
      const p = this.ProviderToUse;
      const errorMessage = await p.GetEntityObject<MJConversationDetailEntity>('MJ: Conversation Details', p.CurrentUser);
      errorMessage.NewRecord();
      errorMessage.Role = 'Error';
      errorMessage.Message = 'Error took place' + err;
      this.AddMessageToCurrentConversation(errorMessage, true, false);
      this.AllowSend = true;
    }
  }

  protected async DeleteConversation(ConversationID: string) {
    const p = this.ProviderToUse;
    const convEntity = await p.GetEntityObject<MJConversationEntity>('MJ: Conversations', p.CurrentUser);
    await convEntity.Load(ConversationID);
    return await convEntity.Delete();
  }

  private _processingStatus: { [key: string]: any } = {};
  protected IsSkipProcessing(Conversation: MJConversationEntity): boolean {
    if (!Conversation) {
      return false;
    }
    else if (this._processingStatus[Conversation.ID]) {
      return this._processingStatus[Conversation.ID];
    } 
    else if (Conversation.Status === 'Processing') {
      // Check the database status field as well (important for page refreshes)
      return true;
    }
    else {
      return false;
    }
  }

  public IsTextAreaEmpty(): boolean {
    if(this.askSkipInput && this.askSkipInput.nativeElement){
      const input: string = this.askSkipInput.nativeElement.value;
      if(!input){
        return true;
      }

      const trimmedInput = input.trim();
      if(trimmedInput.length === 0 || trimmedInput === ''){
        return true;
      }
    }

    return false;
  }

  public isDataContextDialogVisible: boolean = false;
  public showDataContextDialog() {
    this.isDataContextDialogVisible = true;
  }
  public closeDataContextDialog() {
    this.isDataContextDialogVisible = false;
  }

  public isSharingDialogVisible: boolean = false;
  public showSharingDialog() {
    this.isSharingDialogVisible = true;
  }
  public async closeSharingDialog(action: 'yes' | 'no') {
    if (action === 'yes' && this.resourcePermissions) {
      if (!await this.resourcePermissions.SavePermissions()) {
        // let the user know that sharing failed
        this.notificationService.CreateSimpleNotification('Failed to save permissions', 'error', 2500);
      }
      else {
        // let the user know that sharing was successful
        this.notificationService.CreateSimpleNotification('Conversation sharing settings updated', 'success', 1500);
      }
    }

    this.isSharingDialogVisible = false;
  }


  private CompositeKeyIsPopulated(): boolean {
    return this.LinkedEntityCompositeKey.KeyValuePairs && this.LinkedEntityCompositeKey.KeyValuePairs.length > 0;
  }

  public ngOnDetach() {
    if (this.sub) {
      this.sub.unsubscribe();
    }
  }

  public ngOnAttach() {
    if (this.sub && !this.sub.closed) {
      return;
    }

    this.sub = this.router.events
      .pipe(
        filter((e) => e instanceof ActivationEnd),
        take(1)
      )
      .subscribe(() => {
        this.onNavBackToCachedComponent();
      });
  }

  private onNavBackToCachedComponent(): void {
    if (this.paramsSubscription) {
      this.paramsSubscription.unsubscribe();
    }

    this.paramsSubscription = this.route.params.subscribe((params) => {
      const convoIDParam = params.conversationId;
      this.loadConversations(convoIDParam);
    });
  }


  public confirmMessageEditOrDeleteDialogOpen: boolean = false;
  public messageToEditOrDelete: MJConversationDetailEntity | undefined;
  public messageEditOrDeleteType: 'edit' | 'delete' = 'edit';
  public HandleMessageEditOrDeleteRequest(message: MJConversationDetailEntity, type: 'edit' | 'delete') {
    if (this.SelectedConversation && !this.IsSkipProcessing(this.SelectedConversation)) {
      this.messageToEditOrDelete = message;
      this.messageEditOrDeleteType = type;
      this.confirmMessageEditOrDeleteDialogOpen = true;  
    }
  }
  public HandleMessageEditRequest(message: MJConversationDetailEntity) {
    this.HandleMessageEditOrDeleteRequest(message, 'edit');
  }
  public HandleMessageDeleteRequest(message: MJConversationDetailEntity) {
    this.HandleMessageEditOrDeleteRequest(message, 'delete');
  }

  public closeMessageEditOrDeleteDialog(yesno: 'yes' | 'no') {
    this.confirmMessageEditOrDeleteDialogOpen = false;
    if (this.messageToEditOrDelete && yesno === 'yes') {
      // the user has requested to either edit or delete the message. This situation calls
      // for (a) removing all subsequent messages in the conversation in both cases
      // in the case where they are editing an existing message, we edit the current message
      // and then resubmit it. In both cases in the UI we have to update by removing all
      // subsequent messages. 
      if (this.messageEditOrDeleteType === 'edit') {
        this.editMessage(this.messageToEditOrDelete);
      } else {
        this.deleteMessage(this.messageToEditOrDelete);
      }
    }    
  }

  protected async editMessage(message: MJConversationDetailEntity) {
    const oldMessageText = message.Message;
    await this.deleteMessage(message);
    // now add the text from the message to the input box
    this.askSkipInput.nativeElement.value = oldMessageText;
    // this will let the user edit the message and submit it
  }

  protected async deleteMessage(message: MJConversationDetailEntity) {
    if (!this.SelectedConversation || this.IsSkipProcessing(this.SelectedConversation)) {
      return; // don't allow deleting messages while we're processing or don't have a selected convo
    }

    this.setProcessingStatus(this.SelectedConversation.ID, true);
    // first find all the subsequent messages in the conversation
    const idx = this.Messages.findIndex((m) => m.ID === message.ID);
    if (idx >= 0) {
      const currentAndSubsequentMessages = this.Messages.slice(idx);
      const tg = await this.ProviderToUse.CreateTransactionGroup();
      
      // Track artifacts that need to be deleted
      const artifactsToDelete = new Map<string, { artifactId: string; versionIds: Set<string> }>();
      
      for (const m of currentAndSubsequentMessages) {
        // need to create the BaseEntity subclass for the conversation detail entity
        // as our initial load of the conversation detail entity is not a full object it is 
        // a simple javascript object.
        const actualEntityObject = await this.ProviderToUse.GetEntityObject<MJConversationDetailEntity>('MJ: Conversation Details', this.ProviderToUse.CurrentUser);
        if (await actualEntityObject.Load(m.ID)) {
          // check to see if it loaded succesfully or not, sometimes it is already deleted
          if (actualEntityObject.ConversationID === this.SelectedConversation.ID) {
            // Track artifacts before deletion
            if (actualEntityObject.ArtifactID) {
              if (!artifactsToDelete.has(actualEntityObject.ArtifactID)) {
                artifactsToDelete.set(actualEntityObject.ArtifactID, {
                  artifactId: actualEntityObject.ArtifactID,
                  versionIds: new Set()
                });
              }
              if (actualEntityObject.ArtifactVersionID) {
                artifactsToDelete.get(actualEntityObject.ArtifactID)!.versionIds.add(actualEntityObject.ArtifactVersionID);
              }
            }
            
            actualEntityObject.TransactionGroup = tg;
            await actualEntityObject.Delete();  
          }
          else {
            // didn't load successfully, drop to console, possibly the record was already deleted, non-fatal
            console.log('Error loading conversation detail entity for deletion', m);
          }
        }
        else {
          // problem loading the entity, drop to console, possibly the record was already deleted, non-fatal
          console.log('Error loading conversation detail entity for deletion', m);
        }
      }

      // Delete orphaned artifact versions and artifacts
      for (const [artifactId, artifactInfo] of artifactsToDelete) {
        // Delete artifact versions
        for (const versionId of artifactInfo.versionIds) {
          const artifactVersion = await this.ProviderToUse.GetEntityObject<MJConversationArtifactVersionEntity>('MJ: Conversation Artifact Versions', this.ProviderToUse.CurrentUser);
          if (await artifactVersion.Load(versionId)) {
            artifactVersion.TransactionGroup = tg;
            await artifactVersion.Delete();
          }
        }
        
        // Check if this artifact is referenced by any other conversation details
        const rv = new RunView();
        const otherReferences = await rv.RunView({
          EntityName: 'MJ: Conversation Details',
          ExtraFilter: `ArtifactID = '${artifactId}' AND ID NOT IN ('${currentAndSubsequentMessages.map(m => m.ID).join("','")}')`,
          MaxRows: 1
        }, this.ProviderToUse.CurrentUser);
        
        // If no other references exist, delete the artifact
        if (!otherReferences.Results || otherReferences.Results.length === 0) {
          const artifact = await this.ProviderToUse.GetEntityObject<MJConversationArtifactEntity>('MJ: Conversation Artifacts', this.ProviderToUse.CurrentUser);
          if (await artifact.Load(artifactId)) {
            artifact.TransactionGroup = tg;
            await artifact.Delete();
          }
        }
      }

      // now submit the transaction group
      if (await tg.Submit()) {
        // Remove messages from UI immediately
        for (const m of currentAndSubsequentMessages) {
          this.RemoveMessageFromCurrentConversation(m);
        }
        
        this.setProcessingStatus(this.SelectedConversation.ID, false); // done
        
        // Force change detection to update the UI
        this.cdRef.detectChanges();
        
        // Optionally reload conversation to ensure sync with database
        const convo = this.SelectedConversation;
        this.SelectedConversation = undefined; // wipe out so the below does something
        this.SelectConversation(convo); // reload the conversation to get the latest messages
      }
      else {
        // alert the user to the error
        this.setProcessingStatus(this.SelectedConversation.ID, false); // done
        this.notificationService.CreateSimpleNotification('Error deleting messages', 'error', 3000);
      }
    }
  }

  public get NumVisibleButtons(): number {
    let count = 1;
    if (this.ShowDataContextButton) 
      count++;
    if (this.ShowSharingButton && this.SelectedConversationCurrentUserPermissionLevel === 'Owner') 
      count++;
    // TEMPORARY: Add 1 for test button
    count++;
    return count;
  }

  @ViewChild('splitPanel') splitPanel: any;

  /**
   * Handles when an artifact is selected from a message
   * @param artifact The artifact information
   */
  public onArtifactSelected(artifact: any): void {
    if (this.EnableArtifactSplitView) {
      // Store artifact in component state
      this.selectedArtifact = artifact;
      
      // Ensure a delay to allow Angular's change detection to catch up
      this.setTimeout(() => {
        if (this.selectedArtifact && this.splitPanel) {
          // First, check if we're already in BothSides mode
          const currentMode = this.splitPanel.Mode;
          
          if (currentMode === 'LeftOnly') {
            // If previously closed, use the stored default ratio or previously saved ratio
            this.SplitRatio = this.splitPanel._lastRatioBeforeClosing || this.DefaultSplitRatio;
          }
          
          // Explicitly set the split panel to BothSides mode with the correct ratio
          this.splitPanel.setMode('BothSides');
          
          // Emit events for parent components
          this.ArtifactSelected.emit(artifact);
          
          // If the artifact has a messageId, we also emit the ArtifactViewed event
          if (artifact && artifact.messageId) {
            this.ArtifactViewed.emit(artifact);
          }
        }
      }, 50); // Slightly longer timeout to ensure DOM updates complete
    }
  }
  
  /**
   * Handles when an artifact is selected from the artifacts counter/badge
   * @param artifact The artifact information
   */
  public onArtifactSelectedFromCounter(artifact: any): void {
    if (this.EnableArtifactSplitView) {
      this.selectedArtifact = {
        artifactId: artifact.ID,
        artifactVersionId: null
      };
      this.SplitRatio = this.DefaultSplitRatio;
      this.ArtifactSelected.emit(artifact);
      this.ArtifactViewed.emit(artifact);
    }
  }

  /**
   * Handles when the split ratio changes
   * @param ratio The new split ratio
   */
  public onSplitRatioChanged(ratio: number): void {
    // Store the updated ratio
    this.SplitRatio = ratio;
  }

  /**
   * Clears the selected artifact and closes the split panel
   */
  public closeArtifactPanel(): void {
    this.selectedArtifact = null;
    this.artifactHeaderInfo = null;
    this.artifactVersionList = [];
    this.selectedArtifactVersionId = '';
  }

  /**
   * Handles when an artifact version is selected from the dropdown
   * @param versionId The ID of the selected version
   */
  public onArtifactVersionSelected(versionId: string): void {
    if (this.selectedArtifact) {
      // Update the selected artifact with the new version
      this.selectedArtifact = {
        ...this.selectedArtifact,
        artifactVersionId: versionId
      };
      
      // The artifact viewer will handle loading the new version
      this.ArtifactViewed.emit(this.selectedArtifact);
    }
  }
  
  /**
   * Handles when artifact info changes (from the artifact viewer)
   * @param info The updated artifact header information
   */
  public onArtifactInfoChanged(info: {
    title: string;
    type: string;
    date: Date | null;
    version: string;
    versionList?: Array<{ID: string, Version: string | number, __mj_CreatedAt: Date}>;
    selectedVersionId?: string;
  }): void {
    this.artifactHeaderInfo = {
      title: info.title,
      type: info.type,
      date: info.date,
      version: info.version
    };
    
    if (info.versionList) {
      this.artifactVersionList = info.versionList;
    }
    
    if (info.selectedVersionId) {
      this.selectedArtifactVersionId = info.selectedVersionId;
    }
  }

  /**
   * Stops the current processing conversation
   * - Updates conversation status to Available
   * - Deletes the last user message
   * - Restores the text to the input area
   */
  public async stopProcessing(): Promise<void> {
    if (!this.SelectedConversation || !this.IsSkipProcessing(this.SelectedConversation)) {
      return;
    }

    try {
      // Get proper entity object for conversation if needed
      let conversationEntity: MJConversationEntity;
      if (this.SelectedConversation.Save !== undefined) {
        conversationEntity = this.SelectedConversation;
      } else {
        const p = this.ProviderToUse;
        conversationEntity = await p.GetEntityObject<MJConversationEntity>('MJ: Conversations', p.CurrentUser);
        await conversationEntity.Load(this.SelectedConversation.ID);
      }

      // Find the last user message
      const lastUserMessage = this.Messages
        .slice()
        .reverse()
        .find(m => m.Role === 'User');

      if (lastUserMessage) {
        // Store the message text to restore to input
        const messageText = lastUserMessage.Message;

        // Update conversation status to Available
        conversationEntity.Status = 'Available';
        await conversationEntity.Save();
        
        // Update the selected conversation object if we loaded a new one
        if (this.SelectedConversation !== conversationEntity) {
          this.SelectedConversation = conversationEntity;
          // Also update in the conversations list
          const idx = this.Conversations.findIndex(c => c.ID === conversationEntity.ID);
          if (idx >= 0) {
            this.Conversations[idx] = conversationEntity;
          }
        }

        // Get proper entity object for the message if needed
        let messageEntity: MJConversationDetailEntity;
        if (lastUserMessage.Delete !== undefined) {
          messageEntity = lastUserMessage;
        } else {
          const p = this.ProviderToUse;
          messageEntity = await p.GetEntityObject<MJConversationDetailEntity>('MJ: Conversation Details', p.CurrentUser);
          await messageEntity.Load(lastUserMessage.ID);
        }

        // Handle artifact cleanup if the message has artifacts
        if (messageEntity.ArtifactID) {
          const tg = await this.ProviderToUse.CreateTransactionGroup();
          
          // Delete artifact version if exists
          if (messageEntity.ArtifactVersionID) {
            const artifactVersion = await this.ProviderToUse.GetEntityObject<MJConversationArtifactVersionEntity>('MJ: Conversation Artifact Versions', this.ProviderToUse.CurrentUser);
            if (await artifactVersion.Load(messageEntity.ArtifactVersionID)) {
              artifactVersion.TransactionGroup = tg;
              await artifactVersion.Delete();
            }
          }
          
          // Check if artifact is referenced elsewhere
          const rv = new RunView();
          const otherReferences = await rv.RunView({
            EntityName: 'MJ: Conversation Details',
            ExtraFilter: `ArtifactID = '${messageEntity.ArtifactID}' AND ID != '${messageEntity.ID}'`,
            MaxRows: 1
          }, this.ProviderToUse.CurrentUser);
          
          // Delete artifact if no other references
          if (!otherReferences.Results || otherReferences.Results.length === 0) {
            const artifact = await this.ProviderToUse.GetEntityObject<MJConversationArtifactEntity>('MJ: Conversation Artifacts', this.ProviderToUse.CurrentUser);
            if (await artifact.Load(messageEntity.ArtifactID)) {
              artifact.TransactionGroup = tg;
              await artifact.Delete();
            }
          }
          
          // Delete the message and submit transaction
          messageEntity.TransactionGroup = tg;
          await messageEntity.Delete();
          await tg.Submit();
        } else {
          // No artifacts, just delete the message
          await messageEntity.Delete();
        }
        
        // Remove from UI
        this.RemoveMessageFromCurrentConversation(lastUserMessage);

        // Restore text to input area
        if (this.askSkipInput && this.askSkipInput.nativeElement) {
          this.askSkipInput.nativeElement.value = messageText;
          this.resizeTextInput();
        }
      }

      // Clear processing state
      this.setProcessingStatus(this.SelectedConversation.ID, false);
      this._conversationsInProgress[this.SelectedConversation.ID] = false;
      this._processingStatus[this.SelectedConversation.ID] = false;
      this._messageInProgress = false;
      this.AllowSend = true;
      
      // Stop polling
      this.stopRequestStatusPolling(this.SelectedConversation.ID);
      
      // Clear any temporary messages
      this.SetSkipStatusMessage('', 0);
      
      // Update the UI
      this.cdRef.detectChanges();
      
      // Focus on the input
      if (this.askSkipInput && this.askSkipInput.nativeElement) {
        this.askSkipInput.nativeElement.focus();
      }
    } catch (error) {
      LogError(`Error stopping processing: ${error}`);
      this.notificationService.CreateSimpleNotification('Failed to stop processing', 'error', 3000);
    }
  }

  /**
   * Checks if the conversation name was updated on the server and syncs it to the UI
   * This typically happens when artifacts are created and Skip renames the conversation
   * @param conversationId The ID of the conversation to check
   */
  private async syncConversationNameFromServer(conversationId: string): Promise<void> {
    const p = this.ProviderToUse;
    const updatedConvo = <MJConversationEntity>await p.GetEntityObject('MJ: Conversations', p.CurrentUser);
    await updatedConvo.Load(conversationId);
    
    if (this.SelectedConversation && updatedConvo.Name !== this.SelectedConversation.Name) {
      // Update the conversation name in memory
      this.SelectedConversation.Name = updatedConvo.Name;
      
      // Update the conversation in the list
      const idx = this.Conversations.findIndex((c) => c.ID === conversationId);
      if (idx >= 0) {
        this.Conversations[idx].Name = updatedConvo.Name;
        // Trigger change detection for the list
        this.Conversations = [...this.Conversations];
      }
    }
  }

  /**
   * Automatically shows an artifact if the provided AI message has one
   * This is called when new AI messages are received to automatically display artifacts
   * @param aiMessage The AI message to check for artifacts
   */
  private autoShowArtifactIfPresent(aiMessage: MJConversationDetailEntity): void {
    if (!this.EnableArtifactSplitView || !aiMessage) {
      return;
    }
    
    // Check if this AI message has an artifact
    const hasArtifact = aiMessage.ArtifactID && aiMessage.ArtifactID.length > 0;
    
    if (hasArtifact) {
      // Check if this is a new artifact or a new version of an existing artifact
      const isNewArtifactOrVersion = this.isNewArtifactOrVersion(aiMessage);
      
      if (isNewArtifactOrVersion) {
        // Automatically show the artifact
        this.setTimeout(() => {
          this.onArtifactSelected({
            artifactId: aiMessage.ArtifactID,
            artifactVersionId: aiMessage.ArtifactVersionID,
            messageId: aiMessage.ID,
            name: null, // Will be loaded by the artifact viewer
            description: null // Will be loaded by the artifact viewer
          });
        }, 100); // Small delay to ensure the UI is ready
      }
    }
  }

  /**
   * Determines if the given AI message contains a new artifact or a new version of an existing artifact
   * @param aiMessage The AI message to check
   * @returns true if this is a new artifact or version, false otherwise
   */
  private isNewArtifactOrVersion(aiMessage: MJConversationDetailEntity): boolean {
    if (!aiMessage.ArtifactID) {
      return false;
    }
    
    // If no artifact is currently selected, this is definitely new
    if (!this.selectedArtifact) {
      return true;
    }
    
    // If the artifact ID is different, this is a new artifact
    if (this.selectedArtifact.artifactId !== aiMessage.ArtifactID) {
      return true;
    }
    
    // If the artifact ID is the same but version ID is different, this is a new version
    if (this.selectedArtifact.artifactVersionId !== aiMessage.ArtifactVersionID) {
      return true;
    }
    
    // Same artifact and version, not new
    return false;
  }

  // Component tester properties
  private componentTesterDialog: DialogRef | null = null;
  private registeredTestComponents: Map<string, any> = new Map();
  
  private async registerPrebuiltComponents(): Promise<void> {
    console.log('Starting registerPrebuiltComponents...');
    
    // Wait for React to be available
    let attempts = 0;
    while (!(window as any).React && attempts < 10) {
      console.log(`Waiting for React... attempt ${attempts + 1}`);
      await new Promise(resolve => this.setTimeout(() => resolve(undefined), 100, { purpose: 'wait-for-react' }));
      attempts++;
    }
    
    // Also ensure Babel is loaded for component compilation
    attempts = 0;
    while (!(window as any).Babel && attempts < 10) {
      console.log(`Waiting for Babel... attempt ${attempts + 1}`);
      await new Promise(resolve => this.setTimeout(() => resolve(undefined), 100, { purpose: 'wait-for-babel' }));
      attempts++;
    }
    
  }
  
  private getRequiredChildComponents(componentName: string): string[] {
    // For pre-built components, return their specific dependencies
    if (componentName === 'ActionBrowser') {
      return ['ActionBrowser', 'ActionCategoryList', 'ActionList'];
    } else if (componentName === 'SearchBox' || componentName === 'CategoryChart') {
      return [componentName];
    } else {
      // For user-added components, return all registered components
      const item = this.registeredTestComponents.get(componentName);
      if (item) {
        return item.dependencies || item.childComponents || [];
      }
      else {
        console.warn(`No registered components found for ${componentName}`);
        return [];
      }
    }
  }     
}

 