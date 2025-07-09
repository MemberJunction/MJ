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
import { LogError, UserInfo, CompositeKey, LogStatus, RunView, RunViewParams, RunViewResult } from '@memberjunction/core';
import { ConversationDetailEntity, ConversationEntity, DataContextEntity, DataContextItemEntity, ResourcePermissionEngine } from '@memberjunction/core-entities';
import { GraphQLDataProvider, GraphQLProviderConfigData } from '@memberjunction/graphql-dataprovider';
import { Container } from '@memberjunction/ng-container-directives';

import { Subscription } from 'rxjs';
import { take, filter } from 'rxjs/operators';
import { ListViewComponent } from '@progress/kendo-angular-listview';
import {
  MJAPISkipResult,
  SkipAPIAnalysisCompleteResponse,
  SkipAPIResponse,
  SimpleRunView,
  SkipResponsePhase,
  SkipComponentRootSpec,
} from '@memberjunction/skip-types';
import { DataContext } from '@memberjunction/data-context';
import { CopyScalarsAndArrays, InvokeManualResize, MJEvent, MJEventType, MJGlobal, SafeJSONParse } from '@memberjunction/global';
import { SkipSingleMessageComponent } from '../skip-single-message/skip-single-message.component';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { ResourcePermissionsComponent } from '@memberjunction/ng-resource-permissions';
import { DrillDownInfo } from '../drill-down-info';
import { SkipReactComponentHost, GlobalComponentRegistry, registerExampleComponents, testGlobalComponentRegistry, compileAndRegisterComponent } from '../dynamic-report/skip-react-component-host';
import { WindowRef, DialogService, DialogRef } from '@progress/kendo-angular-dialog';

@Component({
  selector: 'skip-chat',
  templateUrl: './skip-chat.component.html',
  styleUrls: ['./skip-chat.component.css'],
})
export class SkipChatComponent extends BaseAngularComponent implements OnInit, AfterViewInit, AfterViewChecked, OnDestroy {
  @Input() AllowSend: boolean = true;
  @Input() public Messages: ConversationDetailEntity[] = [];
  @Input() public Conversations: ConversationEntity[] = [];
  @Input() public SelectedConversation: ConversationEntity | undefined;
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
  @Input() public SkipMarkOnlyLogoURL: string = "assets/Skip - Mark Only - Small.png";
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
  private _temporaryMessage: ConversationDetailEntity | undefined;
  private _intersectionObserver: IntersectionObserver | undefined;
  private static __skipChatWindowsCurrentlyVisible: number = 0;
  private sub?: Subscription;
  
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
          if (statusObj && statusObj.type === 'AskSkip') {
            this.HandlePushStatusUpdate(statusObj);  
          }
        }
      });
    } catch (e) {
      LogError(e);
    }
  }

  protected LogVerbose(message: string) {
    if (this.VerboseLogging) {
      LogStatus(message);
    }
  }

  protected HandlePushStatusUpdate(statusObj: any) {
    try {
      const obj: { type?: string; 
                   status?: string; 
                   ResponsePhase: string, 
                   conversationID?: string; 
                   message?: string } = statusObj;
      if (obj.type?.trim().toLowerCase() === 'askskip' && obj.status?.trim().toLowerCase() === 'ok') {
        if (obj.conversationID && this._conversationsInProgress[obj.conversationID]) {
          if (obj.conversationID === this.SelectedConversation?.ID) {
            if (obj.message && obj.message.length > 0) {
              // we are in the midst of a possibly long running process for Skip, and we got a message here, so go ahead and display it in the temporary message
              this.LogVerbose(`Skip Chat: Received Push Status for conversation ${obj.conversationID} with message: ${obj.message}`);
              this.SetSkipStatusMessage(obj.message, 0);
            }
            else {
              this.LogVerbose(`Skip Chat: Received Push Status but no message for conversation ${obj.conversationID}`);
            }
          }
          else {
            this.LogVerbose(`Skip Chat: Received Push Status for conversation ${obj.conversationID} but it's not the current conversation`);
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

  public GetConversationItemClass(item: ConversationEntity) {
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
      setTimeout(() => {
        this.InnerSetSkipStatusMessage(message, startTime);
      }, delay);
    } 
    else 
      this.InnerSetSkipStatusMessage(message, startTime);
  }

  protected InnerSetSkipStatusMessage(message: string, startTime?: Date) {
    if (message && message.length > 0) {
      if (!this._temporaryMessage) {
        this._temporaryMessage = <ConversationDetailEntity>(<any>{ ID: -1, Message: message, Role: 'ai', __mj_CreatedAt: startTime }); // create a new object
        this.AddMessageToCurrentConversation(this._temporaryMessage, true, false);
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
      }
      this._AskSkipTextboxPlaceholder = this.DefaultTextboxPlaceholder;
    }
  }

  protected async SetSelectedConversationUser() {
    if (this.SelectedConversation?.UserID) {
      const p = this.ProviderToUse;
      if (p.CurrentUser.ID !== this.SelectedConversation.UserID) {
        const result = await this.RunViewToUse.RunView({
          EntityName: 'Users',
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
        // Check each conversation's status
        for (const convo of this.Conversations) {
          if (convo.Status === 'Processing') {
            // This conversation is currently being processed
            // If this is the currently selected conversation, update the UI
            if (this.SelectedConversation && this.SelectedConversation.ID === convo.ID) {
              this.setProcessingStatus(convo.ID, true);
              this.startRequestStatusPolling(convo.ID);
              this.SetSkipStatusMessage("Processing...", 0, convo.__mj_UpdatedAt);
            }

            this._conversationsInProgress[convo.ID] = true;
            this._messageInProgress = true;
            this.AllowSend = false;
          }
        }
      }
    } catch (error) {
      LogError(`Error checking for processing conversations: ${error}`);
    }
  }
  
  // Track the polling intervals so we can clear them when needed
  private _requestStatusPollingIntervals: { [key: string]: any } = {};
  
  /**
   * Starts polling for conversation status updates
   * @param conversationId The ID of the conversation to poll for
   */
  protected startRequestStatusPolling(convoID: string) {
    // Clear any existing polling for this conversation
    this.stopRequestStatusPolling(convoID);
    
    // Set up polling every 3 seconds
    this._requestStatusPollingIntervals[convoID] = setInterval(async () => {
      await this.checkRequestStatus(convoID);
    }, 3000);
  }
  
  /**
   * Stops polling for conversation status updates
   * @param conversationId The ID of the conversation to stop polling for
   */
  protected stopRequestStatusPolling(conversationId: string) {
    if (this._requestStatusPollingIntervals[conversationId]) {
      clearInterval(this._requestStatusPollingIntervals[conversationId]);
      delete this._requestStatusPollingIntervals[conversationId];
    }
  }

 /**
  * Loads conversation details for a specific conversation and role
  * @param conversationId The ID of the conversation
  * @param role Optional role filter (User or AI)
  * @param limit Optional limit on number of records to return
  * @returns Array of ConversationDetailEntity objects
  */
  protected async LoadRecentConversationDetails(
    conversationId: string,
    role?: string,
    limit?: number
  ): Promise<ConversationDetailEntity[]> {
    try {
      if (!conversationId || conversationId.length === 0) {
        return [];
      }

      // Construct the query to run
      const extraFilter = role ?
        `ConversationID='${conversationId}' AND Role='${role}'` :
        `ConversationID='${conversationId}'`;

      // Use RunView for convenience
      const result = await this.RunViewToUse.RunView<ConversationDetailEntity>({
        EntityName: 'Conversation Details',
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
   * @param conversationId The ID of the conversation to check
   */
  protected async checkRequestStatus(convoID: string) {
    try {
      const p = this.ProviderToUse;
      const conversation = <ConversationEntity>await p.GetEntityObject('Conversations', p.CurrentUser);
      const loadResult = await conversation.Load(convoID);

      if (loadResult && conversation.Status === 'Available') {
        // Conversation is no longer processing, stop polling and refresh the conversation
        this.stopRequestStatusPolling(conversation.ID);

        this.cdRef.detach();
        if (convoID !== this.SelectedConversation?.ID) {
          // this scenario arises when we have a selected convo change after we submitted our request to skip
          // so we do nothing here other than update the status.
          this.setProcessingStatus(convoID, false);
          //the next time the user selects this convo, we will fetch messages
          //from the server rather than using the ones in cache
          this._conversationsToReload[convoID] = true;
        } 
        else {
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
            setTimeout(() => {
              this.scrollToBottom();
            }, 100);
            
            // Automatically show artifact if the new AI message has one
            this.autoShowArtifactIfPresent(aiDetail);
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
        this._messageInProgress = false;

        // now tell Angular to resume its change detection
        this.cdRef.reattach();
        this.cdRef.detectChanges();
        // invoke manual resize with a delay to ensure that the scroll to bottom has taken place
        //InvokeManualResize();

        this.SetSkipStatusMessage('', 500); // slight delay to ensure that the message is removed after the UI has updated with the new response message
        // now set focus on the input box
        this.askSkipInput.nativeElement.focus();
      }
    } catch (error) {
      LogError(`Error checking request status for conversation with ID ${convoID}: ${error}`);
    }
  }

  ngOnDestroy() {
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
      setTimeout(() => {
        this.scrollToBottom();
      }, 200);
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
    let cachedConversations = MJGlobal.Instance.ObjectCache.Find<ConversationEntity[]>(cacheConversationsKey);
    const cacheConversationsServerURL = MJGlobal.Instance.ObjectCache.Find<string>(cacheConversationServerURLKey);
    const gqlConfig = <GraphQLProviderConfigData>this.ProviderToUse.ConfigData;

    if (!cachedConversations || gqlConfig.URL !== cacheConversationsServerURL ) {
      // load up from the database as we don't have any cached conversations
      // or we have a different URL 
      const result = await this.RunViewToUse.RunView({
        EntityName: 'Conversations',
        ExtraFilter: `UserID='${this.ProviderToUse.CurrentUser.ID}'`,
        OrderBy: '__mj_CreatedAt DESC', // get in reverse order so we have latest on top
      });
      if (result && result.Success) {
        // now, cache the conversations for future use
        MJGlobal.Instance.ObjectCache.Replace(cacheConversationsKey, result.Results); // use Replace for safety in case someone else has added to the cache between when we checked and now
        MJGlobal.Instance.ObjectCache.Replace(cacheConversationServerURLKey, gqlConfig.URL); // ensure the key for the conversations object is set to the current server URL

        // also set the local variable so we can use it below
        cachedConversations = <ConversationEntity[]>result.Results;
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
        (c: ConversationEntity) => c.LinkedEntity === this.LinkedEntity && c.LinkedRecordID === this.LinkedEntityCompositeKey.Values()
      ); // ONLY include the linked conversations
    } 
    else {
      this.Conversations = cachedConversations.filter(
        (c: ConversationEntity) => !(c.LinkedEntity && c.LinkedEntity.length > 0 && c.LinkedRecordID && c.LinkedRecordID.length > 0)
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
  public async LoadSingleConversation(conversationId: string): Promise<ConversationEntity | undefined> {
    const rv = new RunView(this.RunViewToUse);
    const result = await rv.RunView<ConversationEntity>({
      EntityName: 'Conversations',
      ExtraFilter: `ID='${conversationId}'`,
      ResultType: 'entity_object'
    });
    if (result && result.Success) {
      return result.Results[0];
    }
  }

  private _oldConvoName: string = '';
  public editConvo(conversation: ConversationEntity) {
    this._oldConvoName = conversation.Name ? conversation.Name : '';
    this.ConversationEditMode = true;
  }

  public cancelConvoEdit(conversation: ConversationEntity) {
    conversation.Name = this._oldConvoName;
    this.ConversationEditMode = false;
  }

  public async saveConvoName(conversation: ConversationEntity) {
    let newConvoObject: ConversationEntity;
    if (conversation.Save !== undefined) {
      newConvoObject = conversation;
    } 
    else {
      const p = this.ProviderToUse;
      newConvoObject = await p.GetEntityObject('Conversations', p.CurrentUser);
      await newConvoObject.Load(conversation.ID);
      // now replace conversation in the list with the new object
      this.Conversations = this.Conversations.map((c) => (c.ID == conversation.ID ? newConvoObject : c));
    }
    newConvoObject.Name = conversation.Name;
    if (await newConvoObject.Save()) {
      this.ConversationEditMode = false;
      // we've already updated the bound UI element, but let's make sure to update the cache as well
      const cachedConversations = MJGlobal.Instance.ObjectCache.Find<ConversationEntity[]>('Conversations');
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
  private _conversationToDelete: ConversationEntity | undefined;
  public async showDeleteConvoDialog(conversation: ConversationEntity) {
    this.confirmDeleteConversationDialogOpen = true;
    this._conversationToDelete = conversation;
  }
  public async closeDeleteConversation(yesno: 'yes' | 'no') {
    this.confirmDeleteConversationDialogOpen = false;
    if (this._conversationToDelete && yesno === 'yes') 
      await this.deleteConvo(this._conversationToDelete);
  }

  public async deleteConvo(conversation: ConversationEntity) {
    // delete the conversation - we might need to load the entity if the current object isn't a "real object"
    if (await this.DeleteConversation(conversation.ID)) {
      // we need to remove the conversation from the request status polling
      this.stopRequestStatusPolling(conversation.ID);
      // get the index of the conversation
      const idx = this.Conversations.findIndex((c) => c.ID === conversation.ID);
      // remove the conversation from the list that is bound to the UI
      this.Conversations = this.Conversations.filter((c) => c.ID != conversation.ID);

      // also, remove the conversation from the cache
      const cachedConversations = MJGlobal.Instance.ObjectCache.Find<ConversationEntity[]>('Conversations');
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
        this.Messages = [];
      }
    } 
    else {
      this.notificationService.CreateSimpleNotification('Error deleting conversation', 'error', 5000);
    }
  }

  public async CreateNewConversation() {
    const p = this.ProviderToUse;
    const convo = await p.GetEntityObject<ConversationEntity>('Conversations', p.CurrentUser);
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
    const dc = await p.GetEntityObject<DataContextEntity>('Data Contexts', p.CurrentUser);
    dc.NewRecord();
    dc.Name = 'Data Context for Skip Conversation';
    dc.UserID = p.CurrentUser.ID;
    if (await dc.Save()) {
      // now create a data context item for the linked record if we have one
      if (this.LinkedEntityID && this.LinkedEntityID.length > 0 && this.CompositeKeyIsPopulated()) {
        const dci = await p.GetEntityObject<DataContextItemEntity>('Data Context Items', p.CurrentUser);
        dci.NewRecord();
        dci.DataContextID = dc.ID;
        if (this.LinkedEntity === 'User Views') {
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
      const cachedConversations = MJGlobal.Instance.ObjectCache.Find<ConversationEntity[]>('Conversations');
      if (cachedConversations) {
        MJGlobal.Instance.ObjectCache.Replace('Conversations', [convo, ...cachedConversations]);
      } else {
        MJGlobal.Instance.ObjectCache.Add('Conversations', [convo, ...this.Conversations]);
      }
      await this.SelectConversation(convo);
      // Ensure scroll to bottom for new conversation
      setTimeout(() => {
        this.scrollToBottom();
      }, 100);
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
  public async UserCanAccessConversation(user: UserInfo, conversation: ConversationEntity): Promise<boolean> {
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
  public async GetUserConversationPermissionLevel(user: UserInfo, conversation: ConversationEntity): Promise<"View" | "Edit" | "Owner" | null> {
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
  public async SelectConversation(conversation: ConversationEntity) {
    
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
        const start = new Date().getTime();
        await this.DataContext.LoadMetadata(this.DataContextID, this.ProviderToUse.CurrentUser, this.ProviderToUse);
        LogStatus('Skip Chat: Time to load data context: ' + (new Date().getTime() - start) + 'ms');
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
        const result = await this.RunViewToUse.RunView<ConversationDetailEntity>({
          EntityName: 'Conversation Details',
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
        setTimeout(() => {
          this.scrollToBottom();
        }, 300); // Give DOM time to render all messages
      }

      this.setProcessingStatus(conversation.ID, oldStatus); // set back to old status as it might have been processing
      
      // Check if this conversation is in 'Processing' status and restore the streaming state
      if (conversation.Status === 'Processing') {
        // This conversation is currently being processed
        this.setProcessingStatus(conversation.ID, true);
        this._conversationsInProgress[conversation.ID] = true;
        this._messageInProgress = true;
        this.AllowSend = false;
        
        // Create the temporary status message after a brief delay to ensure DOM is ready
        setTimeout(() => {
          this.SetSkipStatusMessage("Processing...", 0, conversation.__mj_UpdatedAt);
          // Start polling after the temporary message is created
          this.startRequestStatusPolling(conversation.ID);
        }, 100);
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
        setTimeout(() => {
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
      const convoDetail = <ConversationDetailEntity>await p.GetEntityObject('Conversation Details', p.CurrentUser);
      convoDetail.NewRecord();
      convoDetail.Message = val;
      convoDetail.Role = 'User';
      // this is NOT saved here because it is saved on the server side. Later on in this code after the save we will update the object with the ID from the server, and below
      this.AddMessageToCurrentConversation(convoDetail, true, true);

      this.askSkipInput.nativeElement.value = '';
      this.resizeTextInput();

      this.SetSkipStatusMessage(this.pickSkipStartMessage(), 850);
      
      // Ensure scroll to bottom after adding user message AND progress message
      setTimeout(() => {
        this.scrollToBottom();
      }, 950); // Slightly after the progress message is shown (850ms + 100ms buffer)

      const graphQLRawResult = await this.ExecuteAskSkipQuery(val, await this.GetCreateDataContextID(), this.SelectedConversation);
      const skipResult = <MJAPISkipResult>graphQLRawResult?.ExecuteAskSkipAnalysisQuery;
      // temporarily ask Angular to stop its change detection as many of the ops below are slow and async, we don't want flicker in the UI as stuff happens
      this.cdRef.detach();
      if (skipResult?.Success) {
        if (convoID !== this.SelectedConversation?.ID) {
          // this scenario arises when we have a selected convo change after we submitted our request to skip
          // so we do nothing here other than update the status.
          this.setProcessingStatus(convoID, false);
          //the next time the user selects this convo, we will fetch messages
          //from the server rather than using the ones in cache
          this._conversationsToReload[convoID] = true;
        } 
        else {
          this.setProcessingStatus(convoID, false);
          const innerResult: SkipAPIResponse = JSON.parse(skipResult.Result);

          if (!this.SelectedConversation) {
            const convo = <ConversationEntity>await p.GetEntityObject('Conversations', p.CurrentUser);
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
          const aiDetail = <ConversationDetailEntity>await p.GetEntityObject('Conversation Details', p.CurrentUser);
          await aiDetail.Load(skipResult.AIMessageConversationDetailId); // get record from the database
          this.AddMessageToCurrentConversation(aiDetail, true, true);
          
          // Ensure scroll to bottom after AI response
          setTimeout(() => {
            this.scrollToBottom();
          }, 100);
          
          // Automatically show artifact if the new AI message has one
          this.autoShowArtifactIfPresent(aiDetail);
          // NOTE: we don't create a user notification at this point, that is done on the server and via GraphQL subscriptions it tells us and we update the UI automatically...
        }
      }

      if (this.SelectedConversation) {
        this.setProcessingStatus(this.SelectedConversation.ID, false);
      }

      this.AllowSend = true;
      this._conversationsInProgress[convoID] = false;
      this._messageInProgress = false;

      // now tell Angular to resume its change detection
      this.cdRef.reattach();
      this.cdRef.detectChanges();
      // invoke manual resize with a delay to ensure that the scroll to bottom has taken place
      //InvokeManualResize();

      this.SetSkipStatusMessage('', 500); // slight delay to ensure that the message is removed after the UI has updated with the new response message
      // now set focus on the input box
      this.askSkipInput.nativeElement.focus();
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
    this.Messages = []; // clear out the messages
    
    // Clear the temporary message reference
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
  public AddMessageToCurrentConversation(detail: ConversationDetailEntity, stopChangeDetection: boolean, cacheMessage: boolean) {
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
  public RemoveMessageFromCurrentConversation(detail: ConversationDetailEntity) {
    // update the local binding for the UI
    this.Messages = this.Messages.filter((m) => m !== detail);

    // update the cache of messages for the selected conversation
    const convo = this.SelectedConversation;
    if (convo) {
      const convoAny = <any>convo;
      if (convoAny._Messages) {
        convoAny._Messages = convoAny._Messages.filter((m: ConversationDetailEntity) => m.ID !== detail.ID);
      }
    }

    // dynamically remove the message from the panel
    this.RemoveMessageFromPanel(detail);
  }

  // method to dynamically remove a message
  protected RemoveMessageFromPanel(messageDetail: ConversationDetailEntity) {
    const ref = (<any>messageDetail)._componentRef;
    if (ref) {
      // Temporarily stop change detection for performance
      this.cdRef.detach();

      const index = this.askSkip.viewContainerRef.indexOf(ref.hostView);
      if (index !== -1) {
        this.askSkip.viewContainerRef.remove(index);
      }

      // Resume change detection
      this.cdRef.reattach();
    }
  }

  protected UpdatePanelMessage(messageDetail: ConversationDetailEntity, invokeChangeDetection: boolean = true) {
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
  protected AddMessageToPanel(messageDetail: ConversationDetailEntity, stopChangeDetection: boolean) {
    // Temporarily stop change detection for performance
    if (stopChangeDetection) this.cdRef.detach();

    const componentRef = this.askSkip.viewContainerRef.createComponent(SkipSingleMessageComponent);

    // Pass the message details to the component instance
    const obj = componentRef.instance;

    // bubble up events from the single message component to the parent component
    obj.NavigateToMatchingReport.subscribe((reportId: string) => {
      this.NavigateToMatchingReport.emit(reportId);
    });
    obj.NewReportCreated.subscribe((reportId: string) => {
      this.NewReportCreated.emit(reportId);
    });
    obj.DeleteMessageRequested.subscribe((message: ConversationDetailEntity) => {
      this.HandleMessageDeleteRequest(message);
    });
    obj.EditMessageRequested.subscribe((message: ConversationDetailEntity) => {
      this.HandleMessageEditRequest(message);
    });
    obj.DrillDownEvent.subscribe((drillDownInfo: DrillDownInfo) => {
      this.DrillDownEvent.emit(drillDownInfo);
    });
    obj.ArtifactSelected.subscribe((artifact: any) => {
      this.onArtifactSelected(artifact);
    });

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
    obj.SuggestedQuestionSelected.subscribe((question: string) => {
      this.sendPrompt(question);
    });
    // Whenever the suggested answer is clicked on by the user in the single message component, we want to bubble that up here and send the prompt
    obj.SuggestedAnswerSelected.subscribe((answer: string) => {
      this.sendPrompt(answer);
    });

    // now, stash a link to our newly created componentRef inside the messageDetail so we know which componentRef to remove when we delete the message
    (<any>messageDetail)._componentRef = componentRef;

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
          setTimeout(() => {
            this.scrollToBottom(retryCount + 1);
          }, 50);
        }
        return;
      }
      
      const element = this.scrollContainer.nativeElement;
      if (element.scrollHeight === 0 && retryCount < 10) {
        // If scrollHeight is 0, the content hasn't rendered yet, so retry after a delay
        // But limit retries to prevent infinite loops
        setTimeout(() => {
          this.scrollToBottom(retryCount + 1);
        }, 50);
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
      const dc = await p.GetEntityObject<DataContextEntity>('Data Contexts', p.CurrentUser);
      dc.NewRecord();
      const e = p.Entities.find((e) => e.Name === this.LinkedEntity);
      dc.Name =
        'Data Context for Skip Conversation ' + (e ? ' for ' + e.Name + ' - Record ID: ' + this.LinkedEntityCompositeKey.Values() : '');
      dc.UserID = p.CurrentUser.ID;
      if (await dc.Save()) {
        this.DataContextID = dc.ID;

        // update the conversation with the data context id
        const convo = await p.GetEntityObject<ConversationEntity>('Conversations', p.CurrentUser);
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
          const dci = await p.GetEntityObject<DataContextItemEntity>('Data Context Items', p.CurrentUser);
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

  async ExecuteAskSkipQuery(question: string, dataContextId: string, SelectedConversation: ConversationEntity | undefined) {
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
      const errorMessage = await p.GetEntityObject<ConversationDetailEntity>('Conversation Details', p.CurrentUser);
      errorMessage.NewRecord();
      errorMessage.Role = 'Error';
      errorMessage.Message = 'Error took place' + err;
      this.AddMessageToCurrentConversation(errorMessage, true, false);
      this.AllowSend = true;
    }
  }

  protected async DeleteConversation(ConversationID: string) {
    const p = this.ProviderToUse;
    const convEntity = await p.GetEntityObject<ConversationEntity>('Conversations', p.CurrentUser);
    await convEntity.Load(ConversationID);
    return await convEntity.Delete();
  }

  private _processingStatus: { [key: string]: any } = {};
  protected IsSkipProcessing(Conversation: ConversationEntity): boolean {
    if (!Conversation) {
      return false;
    }
    else if (this._processingStatus[Conversation.ID]) {
      return this._processingStatus[Conversation.ID];
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
  public messageToEditOrDelete: ConversationDetailEntity | undefined;
  public messageEditOrDeleteType: 'edit' | 'delete' = 'edit';
  public HandleMessageEditOrDeleteRequest(message: ConversationDetailEntity, type: 'edit' | 'delete') {
    if (this.SelectedConversation && !this.IsSkipProcessing(this.SelectedConversation)) {
      this.messageToEditOrDelete = message;
      this.messageEditOrDeleteType = type;
      this.confirmMessageEditOrDeleteDialogOpen = true;  
    }
  }
  public HandleMessageEditRequest(message: ConversationDetailEntity) {
    this.HandleMessageEditOrDeleteRequest(message, 'edit');
  }
  public HandleMessageDeleteRequest(message: ConversationDetailEntity) {
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

  protected async editMessage(message: ConversationDetailEntity) {
    const oldMessageText = message.Message;
    await this.deleteMessage(message);
    // now add the text from the message to the input box
    this.askSkipInput.nativeElement.value = oldMessageText;
    // this will let the user edit the message and submit it
  }

  protected async deleteMessage(message: ConversationDetailEntity) {
    if (!this.SelectedConversation || this.IsSkipProcessing(this.SelectedConversation)) {
      return; // don't allow deleting messages while we're processing or don't have a selected convo
    }

    this.setProcessingStatus(this.SelectedConversation.ID, true);
    // first find all the subsequent messages in the conversation
    const idx = this.Messages.findIndex((m) => m.ID === message.ID);
    if (idx >= 0) {
      const currentAndSubsequentMessages = this.Messages.slice(idx);
      const tg = await this.ProviderToUse.CreateTransactionGroup();
      for (const m of currentAndSubsequentMessages) {
        // need to create the BaseEntity subclass for the conversation detail entity
        // as our initial load of the conversation detail entity is not a full object it is 
        // a simple javascript object.
        const actualEntityObject = await this.ProviderToUse.GetEntityObject<ConversationDetailEntity>('Conversation Details', this.ProviderToUse.CurrentUser);
        if (await actualEntityObject.Load(m.ID)) {
          // check to see if it loaded succesfully or not, sometimes it is already deleted
          if (actualEntityObject.ConversationID === this.SelectedConversation.ID) {
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

      // now submit the transaction group
      if (await tg.Submit()) {
        this.setProcessingStatus(this.SelectedConversation.ID, false); // done
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
      setTimeout(() => {
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
      let conversationEntity: ConversationEntity;
      if (this.SelectedConversation.Save !== undefined) {
        conversationEntity = this.SelectedConversation;
      } else {
        const p = this.ProviderToUse;
        conversationEntity = await p.GetEntityObject<ConversationEntity>('Conversations', p.CurrentUser);
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
        let messageEntity: ConversationDetailEntity;
        if (lastUserMessage.Delete !== undefined) {
          messageEntity = lastUserMessage;
        } else {
          const p = this.ProviderToUse;
          messageEntity = await p.GetEntityObject<ConversationDetailEntity>('Conversation Details', p.CurrentUser);
          await messageEntity.Load(lastUserMessage.ID);
        }

        // Delete the last user message
        await messageEntity.Delete();
        
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
   * Automatically shows an artifact if the provided AI message has one
   * This is called when new AI messages are received to automatically display artifacts
   * @param aiMessage The AI message to check for artifacts
   */
  private autoShowArtifactIfPresent(aiMessage: ConversationDetailEntity): void {
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
        setTimeout(() => {
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
  private isNewArtifactOrVersion(aiMessage: ConversationDetailEntity): boolean {
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
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }
    
    // Also ensure Babel is loaded for component compilation
    attempts = 0;
    while (!(window as any).Babel && attempts < 10) {
      console.log(`Waiting for Babel... attempt ${attempts + 1}`);
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }
    
    // Register the pre-built example components
    if ((window as any).React) {
      console.log('React is available, registering pre-built components...');
      console.log('Babel available:', !!(window as any).Babel);
      console.log('Chart available:', !!(window as any).Chart);
      
      try {
        const registered = await registerExampleComponents((window as any).React, (window as any).Chart);
        if (registered) {
          console.log('Pre-built components registered successfully');
          // Mark these as pre-built so we don't try to re-register them
          this.registeredTestComponents.set('ActionBrowser', { componentName: 'ActionBrowser', prebuilt: true });
          this.registeredTestComponents.set('SearchBox', { componentName: 'SearchBox', prebuilt: true });
          this.registeredTestComponents.set('CategoryChart', { componentName: 'CategoryChart', prebuilt: true });
          
          // Verify registration
          const registry = GlobalComponentRegistry.Instance;
          console.log('Registry keys after registration:', registry.getRegisteredKeys());
        } else {
          console.error('Failed to register pre-built components');
        }
      } catch (error) {
        console.error('Error during component registration:', error);
      }
    } else {
      console.error('React not available for component registration');
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
        return item.childComponents;
      }
      else {
        console.warn(`No registered components found for ${componentName}`);
        return [];
      }
    }
  }
  
  /**
   * Process a SkipComponentRootSpec and register all components recursively
   */
  private async processSkipComponentSpec(spec: any, rootName?: string): Promise<{
    success: boolean;
    rootComponentName: string;
    registeredComponents: string[];
    errors: string[];
  }> {
    const errors: string[] = [];
    const registeredComponents: string[] = [];
    
    try {
      // Register root component (plain function, auto-wrapped)
      const rootComponentName = rootName || spec.componentName;
      const success = await compileAndRegisterComponent(
        rootComponentName,
        spec.componentCode,
        'Global', // Use Global context for all test components
        'v1'
      );
      
      if (success) {
        registeredComponents.push(rootComponentName);
        this.registeredTestComponents.set(rootComponentName, spec);
      } else {
        errors.push(`Failed to register root component: ${rootComponentName}`);
      }
      
      // Recursively register child components (plain functions, auto-wrapped)
      if (spec.childComponents && Array.isArray(spec.childComponents)) {
        for (const child of spec.childComponents) {
          await this.registerComponentHierarchy(child, registeredComponents, errors);
        }
      }
      
      return {
        success: errors.length === 0,
        rootComponentName,
        registeredComponents,
        errors
      };
    } catch (error: any) {
      errors.push(`Error processing spec: ${error.message}`);
      return {
        success: false,
        rootComponentName: spec.componentName || 'Unknown',
        registeredComponents,
        errors
      };
    }
  }
  
  /**
   * Recursively register child components
   */
  private async registerComponentHierarchy(
    spec: any,
    registeredComponents: string[],
    errors: string[]
  ): Promise<void> {
    try {
      if (spec.componentCode) {
        // Child components are plain functions, auto-wrapped
        const success = await compileAndRegisterComponent(
          spec.componentName,
          spec.componentCode,
          'Global', // Use Global context for all test components
          'v1'
        );
        
        if (success) {
          registeredComponents.push(spec.componentName);
        } else {
          errors.push(`Failed to register component: ${spec.componentName}`);
        }
      }
      
      // Process nested children
      const childArray = spec.childComponents || spec.components || [];
      for (const child of childArray) {
        await this.registerComponentHierarchy(child, registeredComponents, errors);
      }
    } catch (error: any) {
      errors.push(`Error registering ${spec.componentName}: ${error.message}`);
    }
  }
  
  /**
   * TEMPORARY TEST METHOD - Handle test button click
   */
  public async testButtonClick(): Promise<void> {
    console.log('Test button clicked - Opening Component Tester');
    
    // If dialog already exists, just show it
    if (this.componentTesterDialog) {
      return;
    }
    
    // Create the dialog container directly in the DOM
    const dialogContainer = document.createElement('div');
    dialogContainer.style.position = 'fixed';
    dialogContainer.style.top = '50%';
    dialogContainer.style.left = '50%';
    dialogContainer.style.transform = 'translate(-50%, -50%)';
    dialogContainer.style.width = '90vw';
    dialogContainer.style.maxWidth = '1400px';
    dialogContainer.style.height = '85vh';
    dialogContainer.style.backgroundColor = 'white';
    dialogContainer.style.boxShadow = '0 4px 20px rgba(0,0,0,0.3)';
    dialogContainer.style.borderRadius = '8px';
    dialogContainer.style.zIndex = '10000';
    dialogContainer.style.display = 'flex';
    dialogContainer.style.flexDirection = 'column';
    
    // Create header
    const header = document.createElement('div');
    header.style.padding = '16px 20px';
    header.style.borderBottom = '1px solid #e0e0e0';
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.style.backgroundColor = '#f5f5f5';
    header.style.borderRadius = '8px 8px 0 0';
    
    const title = document.createElement('h3');
    title.textContent = 'Skip Component Tester';
    title.style.margin = '0';
    title.style.fontSize = '18px';
    title.style.fontWeight = '600';
    
    const closeButton = document.createElement('button');
    closeButton.innerHTML = '×';
    closeButton.style.fontSize = '28px';
    closeButton.style.border = 'none';
    closeButton.style.background = 'none';
    closeButton.style.cursor = 'pointer';
    closeButton.style.padding = '0';
    closeButton.style.width = '32px';
    closeButton.style.height = '32px';
    closeButton.style.lineHeight = '1';
    closeButton.onclick = () => {
      // Clean up splitter event listeners
      if (testerContent.refs.splitter && (testerContent.refs.splitter as any).cleanup) {
        (testerContent.refs.splitter as any).cleanup();
      }
      
      document.body.removeChild(dialogContainer);
      document.body.removeChild(backdrop);
      // Clear test components from registry
      this.registeredTestComponents.forEach((spec, name) => {
        if (!spec.prebuilt) {
          // Only remove user-added components, not pre-built ones
          GlobalComponentRegistry.Instance.remove(`${name}_Global_v1`);
        }
      });
      this.registeredTestComponents.clear();
      this.componentTesterDialog = null;
    };
    
    header.appendChild(title);
    header.appendChild(closeButton);
    
    // Create backdrop
    const backdrop = document.createElement('div');
    backdrop.style.position = 'fixed';
    backdrop.style.top = '0';
    backdrop.style.left = '0';
    backdrop.style.right = '0';
    backdrop.style.bottom = '0';
    backdrop.style.backgroundColor = 'rgba(0,0,0,0.5)';
    backdrop.style.zIndex = '9999';
    
    // Create the component tester content
    const testerContent = this.createComponentTesterContent();
    testerContent.element.style.flex = '1';
    testerContent.element.style.overflow = 'hidden';
    
    dialogContainer.appendChild(header);
    dialogContainer.appendChild(testerContent.element);
    
    // Add to DOM
    document.body.appendChild(backdrop);
    document.body.appendChild(dialogContainer);
    
    // Store reference for cleanup
    this.componentTesterDialog = { close: () => closeButton.click() } as any;
    
    // Initialize code editor and other functionality
    setTimeout(() => {
      this.initializeComponentTester(testerContent);
    }, 100);
  }
  
  private createComponentTesterContent(): { element: HTMLElement; refs: any } {
    const container = document.createElement('div');
    container.style.height = '100%';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    
    // Header with controls
    const header = document.createElement('div');
    header.style.padding = '16px';
    header.style.borderBottom = '1px solid #e0e0e0';
    header.style.display = 'flex';
    header.style.gap = '16px';
    header.style.alignItems = 'center';
    
    // Component selector dropdown
    const selectorLabel = document.createElement('label');
    selectorLabel.textContent = 'Component: ';
    selectorLabel.style.fontWeight = 'bold';
    
    const componentSelector = document.createElement('select');
    componentSelector.style.padding = '8px';
    componentSelector.style.borderRadius = '4px';
    componentSelector.style.border = '1px solid #ccc';
    componentSelector.style.minWidth = '200px';
    
    // Add default option
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = 'Select a component...';
    componentSelector.appendChild(defaultOption);
    
    // Add new component button
    const addNewBtn = document.createElement('button');
    addNewBtn.textContent = 'Add New Component';
    addNewBtn.className = 'k-button k-button-md k-rounded-md k-button-solid k-button-solid-primary';
    addNewBtn.style.marginLeft = 'auto';
    
    // Parse & Register button
    const parseBtn = document.createElement('button');
    parseBtn.textContent = 'Parse & Register';
    parseBtn.className = 'k-button k-button-md k-rounded-md k-button-solid k-button-solid-primary';
    parseBtn.disabled = true;
    
    // Clear button
    const clearBtn = document.createElement('button');
    clearBtn.textContent = 'Clear All';
    clearBtn.className = 'k-button k-button-md k-rounded-md k-button-solid k-button-solid-base';
    
    header.appendChild(selectorLabel);
    header.appendChild(componentSelector);
    header.appendChild(parseBtn);
    header.appendChild(clearBtn);
    header.appendChild(addNewBtn);
    
    // Main content area with split view
    const content = document.createElement('div');
    content.style.flex = '1';
    content.style.display = 'flex';
    content.style.overflow = 'hidden';
    content.style.position = 'relative';
    
    // Get saved splitter position from local storage
    const savedPosition = localStorage.getItem('skipComponentTesterSplitterPosition');
    const leftWidth = savedPosition ? parseFloat(savedPosition) : 50;
    const rightWidth = 100 - leftWidth;
    
    // Left panel - Code editor
    const leftPanel = document.createElement('div');
    leftPanel.style.width = `${leftWidth}%`;
    leftPanel.style.display = 'flex';
    leftPanel.style.flexDirection = 'column';
    leftPanel.style.minWidth = '200px';
    
    const editorLabel = document.createElement('div');
    editorLabel.style.padding = '8px 16px';
    editorLabel.style.backgroundColor = '#f5f5f5';
    editorLabel.style.borderBottom = '1px solid #e0e0e0';
    editorLabel.innerHTML = '<strong>JSON Input (SkipComponentRootSpec)</strong>';
    
    const editorContainer = document.createElement('div');
    editorContainer.style.flex = '1';
    editorContainer.style.position = 'relative';
    
    leftPanel.appendChild(editorLabel);
    leftPanel.appendChild(editorContainer);
    
    // Splitter handle
    const splitter = document.createElement('div');
    splitter.style.width = '6px';
    splitter.style.backgroundColor = '#e0e0e0';
    splitter.style.cursor = 'col-resize';
    splitter.style.position = 'relative';
    splitter.style.userSelect = 'none';
    
    // Add hover effect
    splitter.onmouseenter = () => {
      splitter.style.backgroundColor = '#c0c0c0';
    };
    splitter.onmouseleave = () => {
      if (!isDragging) {
        splitter.style.backgroundColor = '#e0e0e0';
      }
    };
    
    // Right panel - Component preview
    const rightPanel = document.createElement('div');
    rightPanel.style.width = `${rightWidth}%`;
    rightPanel.style.display = 'flex';
    rightPanel.style.flexDirection = 'column';
    rightPanel.style.minWidth = '200px';
    
    const previewLabel = document.createElement('div');
    previewLabel.style.padding = '8px 16px';
    previewLabel.style.backgroundColor = '#f5f5f5';
    previewLabel.style.borderBottom = '1px solid #e0e0e0';
    previewLabel.innerHTML = '<strong>Component Preview</strong>';
    
    const previewContainer = document.createElement('div');
    previewContainer.style.flex = '1';
    previewContainer.style.overflow = 'auto';
    previewContainer.style.padding = '16px';
    
    rightPanel.appendChild(previewLabel);
    rightPanel.appendChild(previewContainer);
    
    // Add splitter drag functionality
    let isDragging = false;
    let startX = 0;
    let startLeftWidth = 0;
    
    const handleMouseDown = (e: MouseEvent) => {
      isDragging = true;
      startX = e.pageX;
      startLeftWidth = leftPanel.offsetWidth;
      splitter.style.backgroundColor = '#a0a0a0';
      
      // Prevent text selection during drag
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';
      
      e.preventDefault();
    };
    
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      
      const containerWidth = content.offsetWidth;
      const deltaX = e.pageX - startX;
      const newLeftWidth = startLeftWidth + deltaX;
      const newLeftPercent = (newLeftWidth / containerWidth) * 100;
      
      // Limit the splitter position (20% to 80%)
      if (newLeftPercent >= 20 && newLeftPercent <= 80) {
        leftPanel.style.width = `${newLeftPercent}%`;
        rightPanel.style.width = `${100 - newLeftPercent}%`;
      }
    };
    
    const handleMouseUp = () => {
      if (!isDragging) return;
      
      isDragging = false;
      splitter.style.backgroundColor = '#e0e0e0';
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      
      // Save position to local storage
      const containerWidth = content.offsetWidth;
      const leftPercent = (leftPanel.offsetWidth / containerWidth) * 100;
      localStorage.setItem('skipComponentTesterSplitterPosition', leftPercent.toString());
    };
    
    splitter.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    
    // Clean up event listeners when dialog is closed
    (splitter as any).cleanup = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    // Error display area
    const errorContainer = document.createElement('div');
    errorContainer.style.display = 'none';
    errorContainer.style.padding = '16px';
    errorContainer.style.backgroundColor = '#fee';
    errorContainer.style.color = '#c00';
    errorContainer.style.borderTop = '1px solid #fcc';
    errorContainer.style.maxHeight = '150px';
    errorContainer.style.overflow = 'auto';
    
    content.appendChild(leftPanel);
    content.appendChild(splitter);
    content.appendChild(rightPanel);
    
    container.appendChild(header);
    container.appendChild(content);
    container.appendChild(errorContainer);
    
    return {
      element: container,
      refs: {
        componentSelector,
        addNewBtn,
        parseBtn,
        clearBtn,
        editorContainer,
        previewContainer,
        errorContainer,
        splitter
      }
    };
  }
  
  private async initializeComponentTester(testerContent: { refs: any }): Promise<void> {
    const { componentSelector, addNewBtn, parseBtn, clearBtn, editorContainer, previewContainer, errorContainer } = testerContent.refs;
    
    let currentHost: SkipReactComponentHost | null = null;
    let codeEditorValue = '';
    
    // First, ensure React and other libraries are loaded by creating a temporary host
    const tempContainer = document.createElement('div');
    tempContainer.style.display = 'none';
    document.body.appendChild(tempContainer);

    // this is done to get React loaded
    const tempSpec: SkipComponentRootSpec = {
      componentCode: 'function TempComponent() {};',
      componentName: 'TempComponent',
      functionalRequirements: 'Load React and other libraries',
      technicalDesign: 'Temporary component to load libraries',
      componentType: 'report',
      title: 'Temporary Component',
      description: 'This component is used to load React and other libraries for testing purposes',
      callbackStrategy: 'none',
      childComponents: [],
      stateStructure: {},
      userExplanation: 'This component is used to load React and other libraries for testing purposes',
      techExplanation: 'This component is used to load React and other libraries for testing purposes'
    }
    const tempHost = new SkipReactComponentHost({
      component: tempSpec,
      container: tempContainer,
      data: {},
      metadata: { requiredChildComponents: [], componentContext: 'Global', version: 'v1' }
    });
    
    try {
      await tempHost.initialize();
      console.log('Libraries loaded via temporary host');
    } catch (error) {
      console.error('Error loading libraries:', error);
    } finally {
      tempHost.destroy();
      document.body.removeChild(tempContainer);
    }
    
    // Now register the pre-built test components
    await this.registerPrebuiltComponents();
    
    // Add pre-built components to dropdown
    const prebuiltComponents = [
      { name: 'ActionBrowser', label: 'Action Browser (Pre-built)' },
      { name: 'SearchBox', label: 'Search Box (Pre-built)' },
      { name: 'CategoryChart', label: 'Category Chart (Pre-built)' }
    ];
    
    for (const comp of prebuiltComponents) {
      const option = document.createElement('option');
      option.value = comp.name;
      option.textContent = comp.label;
      componentSelector.appendChild(option);
      
      // Ensure pre-built components are marked as such in our tracking map
      if (!this.registeredTestComponents.has(comp.name)) {
        this.registeredTestComponents.set(comp.name, { componentName: comp.name, prebuilt: true });
      }
    }
    
    // Create a textarea for now instead of the Angular component
    const codeEditor = document.createElement('textarea');
    codeEditor.style.width = '100%';
    codeEditor.style.height = '100%';
    codeEditor.style.fontFamily = 'monospace';
    codeEditor.style.fontSize = '13px';
    codeEditor.style.border = 'none';
    codeEditor.style.outline = 'none';
    codeEditor.style.resize = 'none';
    codeEditor.style.padding = '16px';
    codeEditor.style.backgroundColor = '#f5f5f5';
    
    // Listen for value changes
    codeEditor.addEventListener('input', (event: any) => {
      codeEditorValue = event.target.value;
      parseBtn.disabled = !codeEditorValue.trim();
    });
    
    editorContainer.appendChild(codeEditor);
    
    // Set initial value with example
    const exampleSpec = {
      componentName: "ExampleComponent",
      componentType: "report",
      title: "Example Component",
      description: "An example component",
      functionalRequirements: "Display hello world",
      technicalDesign: "Simple React component",
      callbackStrategy: "none",
      stateStructure: {},
      childComponents: [],
      userExplanation: "Shows hello world",
      techExplanation: "React createElement",
      componentCode: `
        function createComponent(React) {
          const Component = () => {
            return React.createElement('div', {
              style: { padding: '20px', fontSize: '18px' }
            }, 'Hello from Skip Component!');
          };
          return { component: Component };
        }
      `
    };
    
    setTimeout(() => {
      (codeEditor as any).value = JSON.stringify(exampleSpec, null, 2);
      codeEditorValue = JSON.stringify(exampleSpec, null, 2);
      parseBtn.disabled = false;
    }, 200);
    
    // Handle component selection
    componentSelector.addEventListener('change', async () => {
      const selectedName = componentSelector.value;
      if (!selectedName) {
        if (currentHost) {
          currentHost.destroy();
          currentHost = null;
        }
        previewContainer.innerHTML = '<div style="color: #666; text-align: center; padding: 40px;">Select a component to preview</div>';
        return;
      }
      
      // Wait a bit to ensure components are registered
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Debug: Check registry state
      const registry = GlobalComponentRegistry.Instance;
      console.log('Before rendering - Registry keys:', registry.getRegisteredKeys());
      console.log('Looking for component:', selectedName);
      
      // Render the selected component
      currentHost = await this.renderTestComponent(selectedName, previewContainer, currentHost);
    });
    
    // Handle parse & register button
    parseBtn.addEventListener('click', async () => {
      errorContainer.style.display = 'none';
      errorContainer.innerHTML = '';
      
      try {
        const spec = JSON.parse(codeEditorValue);
        
        // Generate unique name if component already exists
        let componentName = spec.componentName;
        let counter = 1;
        while (this.registeredTestComponents.has(componentName)) {
          componentName = `${spec.componentName}_${counter}`;
          counter++;
        }
        
        const result = await this.processSkipComponentSpec(spec, componentName);
        
        if (result.success) {
          // Add to dropdown
          const option = document.createElement('option');
          option.value = componentName;
          option.textContent = `${componentName} (${result.registeredComponents.length} components)`;
          componentSelector.appendChild(option);
          componentSelector.value = componentName;
          
          // Trigger change event to render
          componentSelector.dispatchEvent(new Event('change'));
          
          this.notificationService.CreateSimpleNotification(
            `Successfully registered ${result.registeredComponents.length} components`,
            'success',
            3000
          );
        } else {
          errorContainer.style.display = 'block';
          errorContainer.innerHTML = '<strong>Errors:</strong><br>' + result.errors.join('<br>');
        }
      } catch (error: any) {
        errorContainer.style.display = 'block';
        errorContainer.innerHTML = '<strong>JSON Parse Error:</strong><br>' + error.message;
      }
    });
    
    // Handle clear button
    clearBtn.addEventListener('click', () => {
      // Clear only non-prebuilt components
      this.registeredTestComponents.forEach((spec, name) => {
        if (!spec.prebuilt) {
          GlobalComponentRegistry.Instance.remove(`${name}_Global_v1`);
          this.registeredTestComponents.delete(name);
        }
      });
      
      // Clear dropdown but keep pre-built options
      componentSelector.innerHTML = '';
      const defaultOption = document.createElement('option');
      defaultOption.value = '';
      defaultOption.textContent = 'Select a component...';
      componentSelector.appendChild(defaultOption);
      
      // Re-add pre-built components
      for (const comp of prebuiltComponents) {
        const option = document.createElement('option');
        option.value = comp.name;
        option.textContent = comp.label;
        componentSelector.appendChild(option);
      }
      
      // Clear preview
      if (currentHost) {
        currentHost.destroy();
        currentHost = null;
      }
      previewContainer.innerHTML = '<div style="color: #666; text-align: center; padding: 40px;">Select a component to preview</div>';
      
      // Clear editor
      (codeEditor as any).value = '';
      codeEditorValue = '';
      parseBtn.disabled = true;
    });
    
    // Handle add new button
    addNewBtn.addEventListener('click', () => {
      (codeEditor as any).value = JSON.stringify(exampleSpec, null, 2);
      codeEditorValue = JSON.stringify(exampleSpec, null, 2);
      parseBtn.disabled = false;
    });
    
    // Initial state
    previewContainer.innerHTML = '<div style="color: #666; text-align: center; padding: 40px;">Paste JSON and click "Parse & Register" to test a component</div>';
  }
  
  private async renderTestComponent(
    componentName: string,
    container: HTMLElement,
    currentHost: SkipReactComponentHost | null
  ): Promise<SkipReactComponentHost | null> {
    // Clean up existing host
    if (currentHost) {
      currentHost.destroy();
    }
    
    container.innerHTML = '';
    
    try {
      // Create wrapper component that uses the selected component
      const wrapperCode = `
        function createComponent(React, ReactDOM, useState, useEffect, useCallback, createStateUpdater, createStandardEventHandler, libraries) {
          const WrapperComponent = ({ data, utilities, userState, callbacks, styles, components }) => {
            const SelectedComponent = components['${componentName}'];
            
            if (!SelectedComponent) {
              return React.createElement('div', {
                style: { color: 'red', padding: '20px' }
              }, 'Component "${componentName}" not found in registry');
            }
            
            return React.createElement(SelectedComponent, {
              data: data,
              utilities: utilities,
              userState: userState,
              callbacks: callbacks,
              styles: styles,
              components: components
            });
          };
          
          return { component: WrapperComponent };
        }
      `;
     
      const item = this.registeredTestComponents.get(componentName);
      const host = new SkipReactComponentHost({
        component: item,
        container: container,
        data: {},
        initialState: {},
        utilities: {
          md: {} as any,
          rv: new TestRunView() as SimpleRunView,
          rq: {} as any
        },
        metadata: {
          requiredChildComponents: this.getRequiredChildComponents(componentName),
          componentContext: 'Global', // Always use Global context for test components
          version: 'v1'
        },
        callbacks: {
          RefreshData: () => console.log('Refresh data requested'),
          UpdateUserState: (state: any) => console.log('User state updated:', state),
          OpenEntityRecord: (entityName: string, key: CompositeKey) => console.log('Open entity:', entityName, key),
          NotifyEvent: (eventType: string, data: any) => console.log('Event:', eventType, data)
        }
      });
      
      await host.initialize();
      console.log('Component rendered successfully');
      
      return host;
    } catch (error) {
      console.error('Error rendering component:', error);
      container.innerHTML = `<div style="color: red; padding: 20px;">Error rendering component: ${error}</div>`;
      return null;
    }
  }
}


class TestRunView implements SimpleRunView {
  private _rv: RunView;
  constructor() {
    this._rv = new RunView();
  }
  public runView(params: RunViewParams): Promise<RunViewResult> {
    console.log('Running single view with params:', params);
    return this._rv.RunView(params);
  }
  public runViews(params: RunViewParams[]): Promise<RunViewResult[]> {
    console.log('Running multiple views with params:', params);
    return this._rv.RunViews(params);
  }
}