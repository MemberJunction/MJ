import { AfterViewInit, AfterViewChecked, Component, OnInit, ViewChild, ViewContainerRef, Renderer2, ElementRef, Injector, ComponentRef, OnDestroy, Input, ChangeDetectorRef, ComponentFactoryResolver } from '@angular/core';
import { Location } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { LogError, Metadata, RunQuery, RunView, UserInfo } from '@memberjunction/core';
import { ConversationDetailEntity, ConversationEntity, DataContextEntity, DataContextItemEntity } from '@memberjunction/core-entities';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { Container } from '@memberjunction/ng-container-directives';
import { SharedService } from '@memberjunction/ng-shared';

import { Subscription } from 'rxjs';
import { ListViewComponent } from '@progress/kendo-angular-listview';
import { MJAPISkipResult, SkipAPIAnalysisCompleteResponse, SkipAPIClarifyingQuestionResponse, SkipAPIResponse, SkipResponsePhase } from '@memberjunction/skip-types';
import { DataContext } from '@memberjunction/data-context';
import { CopyScalarsAndArrays, MJEvent, MJEventType, MJGlobal } from '@memberjunction/global';
import { SkipSingleMessageComponent } from '../skip-single-message/skip-single-message.component';
  

@Component({
  selector: 'mj-skip-chat',
  templateUrl: './skip-chat.component.html',
  styleUrls: ['./skip-chat.component.css']
})
export class SkipChatComponent implements OnInit, AfterViewInit, AfterViewChecked, OnDestroy {
  @Input() AllowSend: boolean = true;
  @Input() public Messages: ConversationDetailEntity[] = [];
  @Input() public Conversations: ConversationEntity[] = [];
  @Input() public SelectedConversation: ConversationEntity | undefined;
  @Input() public ConversationEditMode: boolean = false;
  @Input() public ShowConversationList: boolean = true;
  @Input() public AllowNewConversations: boolean = true;
  @Input() public Title: string = "Ask Skip"
  @Input() public DataContextID: number = 0;
  @Input() public LinkedEntity: string = '';
  @Input() public LinkedEntityRecordID: number = 0;
  @Input() public ShowDataContextButton: boolean = true;
  
  public SelectedConversationUser: UserInfo | undefined;
  public DataContext!: DataContext;

  private _messageInProgress: boolean = false;
  private _temporaryMessage: ConversationDetailEntity | undefined;

  /**
   * If true, the component will update the browser URL when the conversation changes. If false, it will not update the URL. Default is true.
   */
  @Input() public UpdateAppRoute: boolean = true;

  @ViewChild(Container, { static: true }) askSkip!: Container;
  @ViewChild('AskSkipPanel', { static: true }) askSkipPanel!: ElementRef;
  @ViewChild('mjContainer', { read: ViewContainerRef }) mjContainerRef!: ViewContainerRef;

  @ViewChild('conversationList', { static: false }) conversationList!: ListViewComponent ;

  @ViewChild('AskSkipInput') askSkipInput: any;
  @ViewChild('scrollContainer') private scrollContainer: ElementRef | undefined;
  showScrollToBottomIcon = false;

  constructor(
    public sharedService: SharedService,
    private renderer: Renderer2,
    private route: ActivatedRoute,
    private location: Location,
    private cdRef: ChangeDetectorRef,
  ) {}

  private paramsSubscription!: Subscription;
  ngOnInit() {
      this.SubscribeToNotifications();
  }

  
  protected SubscribeToNotifications() {
    try {
      MJGlobal.Instance.GetEventListener().subscribe( (event: MJEvent) => {
        if (event.event === MJEventType.ComponentEvent) {
          const obj = event.args;
          if (obj.type?.trim().toLowerCase() === 'askskip' && obj.status?.trim().toLowerCase() === 'ok') {
            if (this._messageInProgress) {
              // we are in the midst of a possibly long running process for Skip, and we got a message here, so go ahead and display it in the temporary message
              this.SetSkipStatusMessage(obj.message, 0);
            }
          }
        }
      });
    }
    catch (e) {
      LogError(e);
    }
  }

  protected SetSkipStatusMessage(message: string, delay: number) {
    if (delay && delay > 0) {
      setTimeout(() => {
        this.InnerSetSkipStatusMessage(message);
      }, delay);
    }
    else 
      this.InnerSetSkipStatusMessage(message);
  }

  protected InnerSetSkipStatusMessage(message: string) {
    if (message && message.length > 0) {
      if (!this._temporaryMessage)  {
        this._temporaryMessage = <ConversationDetailEntity><any>{ID: -1, Message: message, Role: 'ai'}; // create a new object
        this.AddMessageToCurrentConversation(this._temporaryMessage, true);
      }
      else {
        this._temporaryMessage.Message = message;
        // we need to send a refresh signal to the component linked to this detail record
        const ref = (<any>this._temporaryMessage)._componentRef;
        if (ref) {
          const obj = ref.instance;
          if (obj && obj.RefreshMessage)
            obj.RefreshMessage();
        }
      }  
    }
    else {
      if (this._temporaryMessage) {
        // get rid of the temporary message
        this.RemoveMessageFromCurrentConversation(this._temporaryMessage);
        this._temporaryMessage = undefined;
      }
    }
    this.scrollToBottomAnimate();
  }
  
  protected async SetSelectedConversationUser() {
    if (this.SelectedConversation?.UserID) {
      const md = new Metadata();
      if (md.CurrentUser.ID !== this.SelectedConversation.UserID) {
        const rv = new RunView(); // inefficient, cache this later
        const result = await rv.RunView({
          EntityName: 'Users',
          ExtraFilter: 'ID=' + this.SelectedConversation.UserID
        })
        this.SelectedConversationUser = result && result.Success ? <UserInfo>result.Results[0] : undefined;  
      }
      else
        this.SelectedConversationUser = md.CurrentUser; // current user is the one for this convo, just use that to avoid the extra query
    }
  }
 


  public get LinkedEntityID(): number | null {
    if (this.LinkedEntity && this.LinkedEntity.length > 0) {
      // lookup the entity id from the linkedentity provided to us as a property
      const md = new Metadata();
      const e = md.Entities.find(e => e.Name === this.LinkedEntity);
      if (e) 
        return e.ID;
    }
    return null;
  }

  ngOnDestroy() {
    // Unsubscribe to prevent memory leaks
    if (this.paramsSubscription) {
      this.paramsSubscription.unsubscribe();
    }
  }
  
  private _loaded: boolean = false;
  ngAfterViewInit(): void {
    this.paramsSubscription = this.route.params.subscribe(params => {
      if (!this._loaded) {
        this._loaded = true; // do this once

        const conversationId = params['conversationId'];
        if (conversationId && !isNaN(conversationId)) {
          this.loadConversations(parseInt(conversationId, 10)); // Load the conversation based on the conversationId
        } else {
          this.loadConversations();
        }
      }
    });
    this.checkScroll();
  } 

  private _scrollToBottom: boolean = false;
  ngAfterViewChecked(): void {
    // have a short delay to make sure view is fully rendered via event cycle going through its queue
    setTimeout(() => {
      if (this._scrollToBottom) {
        this.scrollToBottom();
      }
      this._scrollToBottom = false;      
    },200);
  }

  protected async loadConversations(conversationIdToLoad: number | undefined = undefined) {
    const md = new Metadata();
    const rv = new RunView();
    let linkFilter: string = '';
    if (this.LinkedEntity && this.LinkedEntityRecordID > 0) 
      linkFilter = ` AND LinkedEntity='${this.LinkedEntity}' AND LinkedRecordID=${this.LinkedEntityRecordID}`

    const result = await rv.RunView({
      EntityName: 'Conversations',
      ExtraFilter: 'UserID=' + md.CurrentUser.ID + linkFilter,
      OrderBy: 'CreatedAt DESC' // get in reverse order
    })
    if (result && result.Success) {
      this.Conversations = <ConversationEntity[]>result.Results;
    }
    if (this.Conversations.length === 0) {
      // no conversations, so create a new one
      this.CreateNewConversation();
      this.sharedService.InvokeManualResize(1);
    }
    else if (conversationIdToLoad) {
      // we have > 0 convos and we were asked to load a specific one
      const convo = this.Conversations.find(c => c.ID == conversationIdToLoad);
      if (convo) {
        this.SelectConversation(convo);
      }
      else {
        // we didn't find the conversation so just select the first one
        this.SelectConversation(this.Conversations[0])
      }
    }
    else {
      // select the first conversation since no param was provided and we have > 0 convos
      this.SelectConversation(this.Conversations[0])
    }
  }

  private _oldConvoName: string = '';
  public editConvo(conversation: ConversationEntity) {
    this._oldConvoName = conversation.Name;
    this.ConversationEditMode = true;
  }
  public cancelConvoEdit(conversation: ConversationEntity) {
    conversation.Name = this._oldConvoName;
    this.ConversationEditMode = false;
  }
  public async saveConvoName(conversation: ConversationEntity) {
    let newConvoObject: ConversationEntity;
    if (conversation.Save !== undefined) {
      newConvoObject = conversation
    }
    else {
      const md = new Metadata();
      newConvoObject = await md.GetEntityObject('Conversations');
      await newConvoObject.Load(conversation.ID);
      // now replace conversation in the list with the new object
      this.Conversations = this.Conversations.map(c => c.ID == conversation.ID ? newConvoObject : c);
    }
    newConvoObject.Name = conversation.Name;
    if(await newConvoObject.Save())        
      this.ConversationEditMode = false;
    else
      this.sharedService.CreateSimpleNotification('Error saving conversation name', 'error', 5000)
  }
  public async deleteConvo(conversation: ConversationEntity) {
    if (confirm('Are you sure you want to delete this conversation?')) {
      // delete the conversation - we might need to load the entity if the current object isn't a "real object"
      if (await this.DeleteConversation(conversation.ID)) { 
        // get the index of the conversation
        const idx = this.Conversations.findIndex(c => c.ID === conversation.ID);
        // remove the conversation from the list
        this.Conversations = this.Conversations.filter(c => c.ID != conversation.ID);
        if (this.Conversations.length > 0) {
          const newIdx = idx > 0 ? idx - 1 : 0;
          this.SelectConversation(this.Conversations[newIdx]);
        }
        else
          this.Messages = [];
      }
      else {
        this.sharedService.CreateSimpleNotification('Error deleting conversation', 'error', 5000)
      }
    }
  }

  
  public async CreateNewConversation() {
    const md = new Metadata();
    const convo = await md.GetEntityObject<ConversationEntity>('Conversations');
    convo.NewRecord();
    convo.Name = 'New Chat'; // default value
    convo.UserID = md.CurrentUser.ID;
    const linkedEntityID = this.LinkedEntityID;
    if (linkedEntityID && linkedEntityID > 0 && this.LinkedEntityRecordID > 0) {
      convo.LinkedEntityID = linkedEntityID;
      convo.LinkedRecordID = this.LinkedEntityRecordID
    }
    await convo.Save();
    this.Conversations = [convo, ...this.Conversations]; // do this way instead of unshift to ensure that binding refreshes
    this.SelectConversation(convo);
    this._scrollToBottom = true; // this results in the angular after Viewchecked scrolling to bottom when it's done
  }
  
  onEnter(event: any) {
    this.sendSkipMessage();
  }

  public async SelectConversation(conversation: ConversationEntity) {
    if (conversation && conversation.ID !== this.SelectedConversation?.ID) {
      // load up the conversation if not already the one that's loaded
      this.ClearMessages();
      const oldStatus = this._processingStatus[conversation.ID];
      this._processingStatus[conversation.ID] = true;
      this.SelectedConversation = conversation;
      this.SetSelectedConversationUser();
      this.DataContextID = conversation.DataContextID;
      this.DataContext = new DataContext();
      await this.DataContext.LoadMetadata(this.DataContextID);

      const md = new Metadata();
      const rv = new RunView();

      const result = await rv.RunView({
        EntityName: 'Conversation Details',
        ExtraFilter: 'ConversationID=' + conversation.ID,
        OrderBy: 'CreatedAt ASC' // show messages in order of creation
      })
      if (result && result.Success) {
        // copy the results into NEW objects into the array, we don't want to modify the original objects
        this.Messages = <ConversationDetailEntity[]>result.Results;
        //this.Messages = <ConversationDetailEntity[]>result.Results;
        this.cdRef.detach(); // temporarily stop change detection to improve performance
        for (const m of this.Messages) {
          this.AddMessageToPanel(m, false); 
        }
        this.cdRef.reattach(); // resume change detection

        this._scrollToBottom = true; // this results in the angular after Viewchecked scrolling to bottom when it's done
      }
      this._processingStatus[conversation.ID] = oldStatus; // set back to old status as it might have been processing
      this.sharedService.InvokeManualResize(500);

      // ensure the list box has the conversation in view
      this.scrollToConversation(conversation.ID);

      if (this.UpdateAppRoute) {
        // finally update the browser URL since we've changed the conversation ID
        this.location.go('/askskip/' + conversation.ID);
        //      this.router.navigate(['askskip', conversation.ID]);
      }
    }
  }

  protected scrollToConversation(conversationId: number): void {
    if (this.conversationList) {
      const convoElement = this.conversationList.element.nativeElement
      const itemIndex = this.Conversations.findIndex(c => c.ID === conversationId);
      // Find the item element within the container based on its index
      const itemElement = Array.from(convoElement.querySelectorAll('[data-kendo-listview-item-index]') as NodeListOf<HTMLElement>)
                          .find((el: HTMLElement) => parseInt(el.getAttribute('data-kendo-listview-item-index')!, 10) === itemIndex);

      if (itemElement) {
        setTimeout(() => {
          // do this within a timeout to ensure rendering is completed
          itemElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
        },100);
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
    }
    catch (e) {
      LogError(e);
    }
  }

  private static _startMessages = [
    "On it, let me get back to you in a moment with the results!🤖",
    "I'm on it, just a moment! 🙂",
    "I'll get started in a jiffy!",
    "You bet, I'd love to help, give me a moment!",
    "I understand, I'll start running in that direction 👟",
    "No problem, I'll get started right away!",
    "Ok, heard loud and clear, I'll jump right on it! 👂",
    "Aye aye captain, I'll get started right away! ⚓"      
  ]
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
  async sendSkipMessage() {
    const val = this.askSkipInput.nativeElement.value;
    if (val && val.length > 0) {
      const convoID: number = this.SelectedConversation ? this.SelectedConversation.ID : -1;
      if (this.SelectedConversation)
        this._processingStatus[this.SelectedConversation?.ID] = true;
      this._messageInProgress = true;
      this.AllowSend = false;
      const md = new Metadata();
      const convoDetail = <ConversationDetailEntity>await md.GetEntityObject('Conversation Details');
      convoDetail.NewRecord();
      convoDetail.Message = val;
      convoDetail.Role = 'user';
      // this is NOT saved here because it is saved on the server side. Later on in this code after the save we will update the object with the ID from the server, and below
      this.AddMessageToCurrentConversation(convoDetail, true)

      this.SetSkipStatusMessage(this.pickSkipStartMessage(), 850);

      this.askSkipInput.nativeElement.value = '';
      this.resizeTextInput();

      this._scrollToBottom = true; // this results in the angular after Viewchecked scrolling to bottom when it's done
      const graphQLRawResult = await this.ExecuteAskSkipQuery(val, await this.GetCreateDataContextID(), this.SelectedConversation);
      const skipResult = <MJAPISkipResult>graphQLRawResult?.ExecuteAskSkipAnalysisQuery;
      // temporarily ask Angular to stop its change detection as many of the ops below are slow and async, we don't want flicker in the UI as stuff happens
      this.cdRef.detach();
      if (skipResult?.Success) {

        if (convoID !== this.SelectedConversation?.ID) {
          // this scenario arises when we have a selected convo change after we submitted our request to skip
          // so we do nothing here other than update the status. 
          this._processingStatus[convoID] = false;
        }
        else {
          this._processingStatus[convoID] = false; 
          const innerResult = <SkipAPIResponse>JSON.parse(skipResult.Result)

          if (!this.SelectedConversation) {
            const convo = <ConversationEntity>await md.GetEntityObject('Conversations');
            await convo.Load(skipResult.ConversationId);
            this._processingStatus[skipResult.ConversationId] = true;
            this.Conversations.push(convo)
            this.SelectedConversation = convo;
            this.SetSelectedConversationUser();
          }
          else if (this.Messages.length === 1 && skipResult.ResponsePhase === SkipResponsePhase.analysis_complete) {
            // we are on the first message so skip renamed the convo, use that 
            this.SelectedConversation.Name = (<SkipAPIAnalysisCompleteResponse>innerResult).reportTitle!; // this will update the UI

            // the below LOOKS redundant to just updating this.SelectedConversation.Name, but it is needed to ensure that the list box is updated
            // otherwise Angular binding doesn't pick up the change without the below.
            const idx = this.Conversations.findIndex(c => c.ID === this.SelectedConversation?.ID);
            if (idx >= 0) {
              // update our this.Conversations array to reflect the new name. First find the index of the conversation and then get that item and update it
              this.Conversations[idx].Name = this.SelectedConversation.Name;
            }
          }
          await convoDetail.Load(skipResult.UserMessageConversationDetailId); // update the object to load from DB
          const aiDetail = <ConversationDetailEntity>await md.GetEntityObject('Conversation Details');
          await aiDetail.Load(skipResult.AIMessageConversationDetailId) // get record from the database
          this.AddMessageToCurrentConversation(aiDetail, true)
          // NOTE: we don't create a user notification at this point, that is done on the server and via GraphQL subscriptions it tells us and we update the UI automatically...
        }
      }
      else {
        const errorMessage = <ConversationDetailEntity>await md.GetEntityObject('Conversation Details');
        errorMessage.NewRecord();
        errorMessage.Role = 'error';
        errorMessage.Message = 'Error took place';
        this.AddMessageToCurrentConversation(errorMessage, true)
      }
      this._scrollToBottom = true; // this results in the angular after Viewchecked scrolling to bottom when it's done
      if (this.SelectedConversation)
        this._processingStatus[this.SelectedConversation?.ID] = false;

      this.AllowSend = true;
      this._messageInProgress =false;

      // now tell Angular to resume its change detection
      this.cdRef.reattach();
      this.cdRef.detectChanges();
      // invoke manual resize with a delay to ensure that the scroll to bottom has taken place
      //this.sharedService.InvokeManualResize();   

      this.SetSkipStatusMessage('', 3500); // slight delay to ensure that the message is removed after the UI has updated with the new response message
      // now set focus on the input box
      this.askSkipInput.nativeElement.focus();
    }
  } 

  public ClearMessages() {
    this.Messages = []; // clear out the messages
    // remove everything from the panel now
    this.askSkip.viewContainerRef.clear();
  }
  public AddMessageToCurrentConversation(detail: ConversationDetailEntity, stopChangeDetection: boolean) {
    this.Messages.push(detail);
    this.AddMessageToPanel(detail, stopChangeDetection);
  }
  public RemoveMessageFromCurrentConversation(detail: ConversationDetailEntity) {
    this.Messages = this.Messages.filter(m => m !== detail);
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

  // Method to dynamically add a message
  protected AddMessageToPanel(messageDetail: ConversationDetailEntity, stopChangeDetection: boolean) {
    // Temporarily stop change detection for performance
    if (stopChangeDetection)
      this.cdRef.detach();

    const componentRef = this.askSkip.viewContainerRef.createComponent(SkipSingleMessageComponent);

    // Pass the message details to the component instance
    const obj = componentRef.instance;

    obj.ConversationRecord = this.SelectedConversation!;
    obj.ConversationDetailRecord = messageDetail;
    obj.DataContext = this.DataContext;
    obj.ConversationUser = this.SelectedConversationUser!;

    // now, stash a link to our newly created componentRef inside the messageDetail so we know which componentRef to remove when we delete the message
    (<any>messageDetail)._componentRef = componentRef;

    // set flag to scroll to the bottom of the chat panel
    this._scrollToBottom = true;

    // Resume change detection
    if (stopChangeDetection)
      this.cdRef.reattach();
  }


  checkScroll() {
    if (this.scrollContainer) {
      const element = this.scrollContainer.nativeElement;
      const atBottom = element.scrollHeight - element.scrollTop === element.clientHeight;
      
      this.showScrollToBottomIcon = !atBottom;  
    }
  }

  scrollToBottom(): void {
    try {
      this.askSkipPanel.nativeElement.scrollTop = this.askSkipPanel.nativeElement.scrollHeight;
    } catch(err) { 

    }
  }

  scrollToBottomAnimate() {
    if (this.scrollContainer) {
      const element = this.scrollContainer.nativeElement;
      element.scroll({ top: element.scrollHeight, behavior: 'smooth' });  
    }
  }  

  protected async GetCreateDataContextID(): Promise<number> {
    // temporary hack for now, we will have more functionality to do robust UX around DataCOntext viewing and editing soon
    // and get rid of this
    if (!this.DataContextID && this.SelectedConversation) {
      // need to create a data context 
      // add to the new data context a single item for the passed in linked record, which could be a query, view, or something else
      const md = new Metadata();
      const dc = await md.GetEntityObject<DataContextEntity>('Data Contexts');
      dc.NewRecord();
      const e = md.Entities.find(e => e.Name === this.LinkedEntity);
      dc.Name = "Data Context for Skip Conversation " + (e ? ' for ' + e.Name + " - Record ID: " + this.LinkedEntityRecordID : '');
      dc.UserID = md.CurrentUser.ID;
      if (await dc.Save()) {
        this.DataContextID = dc.ID;

        // update the conversation with the data context id
        const convo = await md.GetEntityObject<ConversationEntity>('Conversations');
        await convo.Load(this.SelectedConversation.ID);
        await convo.Save(); // save to the database
        this.SelectedConversation.DataContextID = dc.ID; // update the in-memory object

        if (this.LinkedEntity && this.LinkedEntityRecordID > 0 && e) {
          // now create a single data context item for the new data context 
          let type: string = "";
          switch (e.Name.trim().toLowerCase()) {
            case "user views":
              type='view';
              break;
            case "queries":
              type='query';
              break;
            default: 
              if (this.LinkedEntityRecordID > 0) {
                type='single_record'
              }
              else
                type='full_entity'
              break;
          }
          const dci = await md.GetEntityObject<DataContextItemEntity>('Data Context Items');
          dci.NewRecord();
          dci.DataContextID = dc.ID;
          dci.Type = type;
          if (type==='view')
            dci.ViewID = this.LinkedEntityRecordID;
          else if (type==='query')
            dci.QueryID = this.LinkedEntityRecordID;
          else if (type==='single_record') {
            dci.RecordID = this.LinkedEntityRecordID.toString();
            dci.EntityID = e.ID;
          }
          else if (type==='full_entity')
            dci.EntityID = e.ID;

          if (!await dci.Save()) {
            SharedService.Instance.CreateSimpleNotification("Error creating data context item", 'error', 5000)
            console.log("AskSkipComponent: Error creating data context item")
          }  
        }
      }
      else {
        SharedService.Instance.CreateSimpleNotification("Error creating data context", 'error', 5000)
        console.log("AskSkipComponent: Error creating data context")
      }  
    }
    if (!this.DataContext) {
      // load the actual data context object
      this.DataContext = new DataContext();
      await this.DataContext.LoadMetadata(this.DataContextID);
    }
    return this.DataContextID;
  }


  async ExecuteAskSkipQuery(question: string, dataContextId: number, SelectedConversation: ConversationEntity | undefined) {
    try {
      const gql = `query ExecuteAskSkipAnalysisQuery($userQuestion: String!, $dataContextId: Int!, $conversationId: Int!) {
        ExecuteAskSkipAnalysisQuery(UserQuestion: $userQuestion, DataContextId: $dataContextId, ConversationId: $conversationId) {
          Success
          Status
          Result
          ConversationId 
          UserMessageConversationDetailId
          AIMessageConversationDetailId
        }
      }`
      const result = await GraphQLDataProvider.ExecuteGQL(gql, { 
          userQuestion: question, 
          conversationId: SelectedConversation ? SelectedConversation.ID : 0,
          dataContextId: dataContextId
        });

      return result;
    }
    catch (err) {
      console.error(err);          
      const md = new Metadata();
      const errorMessage = <ConversationDetailEntity>await md.GetEntityObject('Conversation Details');
      errorMessage.NewRecord();
      errorMessage.Role = 'error';
      errorMessage.Message = 'Error took place' + err;
      this.AddMessageToCurrentConversation(errorMessage, true);
      this.AllowSend = true;
    }
  }

  protected async DeleteConversation(ConversationID: number) {
    const md = new Metadata();
    const convEntity = <ConversationEntity>await md.GetEntityObject('Conversations');
    await convEntity.Load(ConversationID);
    return await convEntity.Delete();
  }

  private _processingStatus: { [key: number]: any } = {};
  protected IsSkipProcessing(Conversation: ConversationEntity): boolean {
    if (this._processingStatus[Conversation.ID]) {
      return this._processingStatus[Conversation.ID];
    }
    else 
      return false;
  }

  public isDataContextDialogVisible: boolean = false;
  public showDataContext() {
    this.isDataContextDialogVisible = true;
  }
  public closeDataContextDialog() {
    this.isDataContextDialogVisible = false;
  }
}
