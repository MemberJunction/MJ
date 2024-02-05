import { AfterViewInit, AfterViewChecked, Component, OnInit, ViewChild, ViewContainerRef, Renderer2, ElementRef, Injector, ComponentRef, OnDestroy, Input } from '@angular/core';
import { Location } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { Metadata, RunQuery, RunView } from '@memberjunction/core';
import { ConversationDetailEntity, ConversationEntity } from '@memberjunction/core-entities';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { Container } from '@memberjunction/ng-container-directives';
import { SharedService } from '@memberjunction/ng-shared';

import { SkipDynamicReportComponent } from '../misc/skip-dynamic-report-wrapper';
import { Subscription } from 'rxjs';
import { ListViewComponent } from '@progress/kendo-angular-listview';

export class SkipMessage {
  Type: string='user'
  Message: string= ''
  ID: number = 0
}

export class SkipColumnInfo {
  FieldName!: string
  DisplayName?: string
  DataType!: string
  Description?: string
}

export class SkipExecutionResult {
  analysis?: string
  errorMessage?: string | null;
  htmlReport?: string | null;
  plotData?: { data: any[]; layout: any } | null; // Compatible with Plotly
  resultType!: "data" | "plot" | "html" | null;
  status!: "success" | "error";
  tableData?: any[] | null; // any array of objects
  tableDataColumns: SkipColumnInfo[] = [];
}

export class SkipData {
  executionResults?: SkipExecutionResult
  reportTitle!: string
  scriptText!: string;
  success!: boolean;
  suggestedQuestions?: string[] | null;
  techExplanation?: string
  userExplanation?: string
}

export class ExecuteAskSkipAnalysisQueryResult {
  Success!: boolean
  Status!: string
  Result!: string
  ResultObject!: SkipData;
  ConversationId!: number
  UserMessageConversationDetailId!: number
  AIMessageConversationDetailId!: number
}


@Component({
  selector: 'mj-ask-skip',
  templateUrl: './ask-skip.component.html',
  styleUrls: ['./ask-skip.component.css']
})
export class AskSkipComponent implements OnInit, AfterViewInit, AfterViewChecked, OnDestroy {
  @Input() AllowSend: boolean = true;
  @Input() public Messages: ConversationDetailEntity[] = [];
  @Input() public Conversations: ConversationEntity[] = [];
  @Input() public SelectedConversation: ConversationEntity | undefined;
  @Input() public ConversationEditMode: boolean = false;
  @Input() public ShowConversationList: boolean = true;
  @Input() public AllowNewConversations: boolean = true;
  @Input() public Title: string = "Ask Skip"
  @Input() public ViewID: number = 0;
  @Input() public LinkedEntity: string = '';
  @Input() public LinkedEntityRecordID: number = 0;

  /**
   * If true, the component will update the browser URL when the conversation changes. If false, it will not update the URL. Default is true.
   */
  @Input() public UpdateAppRoute: boolean = true;

  @ViewChild(Container, { static: true }) askSkip!: Container;
  @ViewChild('AskSkipPanel', { static: true }) askSkipPanel!: ElementRef;
  @ViewChild('conversationList', { static: false }) conversationList!: ListViewComponent ;

  @ViewChild('AskSkipInput') askSkipInput: any;

  constructor(
    public sharedService: SharedService,
    private renderer: Renderer2,
    private injector: Injector,
    private router: Router,
    private route: ActivatedRoute,
    private location: Location
  ) {}

  private paramsSubscription!: Subscription;
  ngOnInit() {
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
  } 

  private _scrollToBottom: boolean = false;
  ngAfterViewChecked(): void {
    if (this._scrollToBottom) {
      this.scrollToBottom();
    }
    this._scrollToBottom = false;    
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
      this.sharedService.InvokeManualResize();
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
    this.sendSkipQuestion();
  }

  public async SelectConversation(conversation: ConversationEntity) {
    if (conversation && conversation.ID !== this.SelectedConversation?.ID) {
      // load up the conversation if not already the one that's loaded
      this.Messages = []; // clear out the messages
      const oldStatus = this._processingStatus[conversation.ID];
      this._processingStatus[conversation.ID] = true;
      this.SelectedConversation = conversation;
      const md = new Metadata();
      const rv = new RunView();

      const result = await rv.RunView({
        EntityName: 'Conversation Details',
        ExtraFilter: 'ConversationID=' + conversation.ID,
        OrderBy: 'CreatedAt ASC' // show messages in order of creation
      })
      if (result && result.Success) {
        this._detailHtml = {};
        this.Messages = <ConversationDetailEntity[]>result.Results;
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


  async sendSkipQuestion() {
    const convoID: number = this.SelectedConversation ? this.SelectedConversation.ID : -1;
    if (this.SelectedConversation)
      this._processingStatus[this.SelectedConversation?.ID] = true;

    const val = this.askSkipInput.nativeElement.value;
    if (val && val.length > 0) {
      this.AllowSend = false;
      const md = new Metadata();
      const convoDetail = <ConversationDetailEntity>await md.GetEntityObject('Conversation Details');
      convoDetail.NewRecord();
      convoDetail.Message = val;
      convoDetail.Role = 'user';
      this.Messages.push(convoDetail); // this is NOT saved here because it is saved on the server side. Later on in this code after the save we will update the object with the ID from the server

      this.askSkipInput.nativeElement.value = '';
      this._scrollToBottom = true; // this results in the angular after Viewchecked scrolling to bottom when it's done
      const result = await this.ExecuteAskSkipQuery(val, this.ViewID, this.SelectedConversation);
      const queryResult = <ExecuteAskSkipAnalysisQueryResult>result?.ExecuteAskSkipAnalysisQuery;
      if (queryResult?.Success) {
        if (convoID !== this.SelectedConversation?.ID) {
          // this scenario arises when we have a selected convo change after we submitted our request to skip
          // so we do nothing here other than update the status. 
          this._processingStatus[convoID] = false;
        }
        else {
          queryResult.ResultObject = <SkipData>JSON.parse(queryResult.Result)

          if (!this.SelectedConversation) {
            const convo = <ConversationEntity>await md.GetEntityObject('Conversations');
            await convo.Load(queryResult.ConversationId);
            this._processingStatus[queryResult.ConversationId] = true;
            this.Conversations.push(convo)
            this.SelectedConversation = convo;
          }
          else if (this.Messages.length === 1) {
            // we are on the first message so skip renamed the convo, use that 
            this.SelectedConversation.Name = queryResult.ResultObject.reportTitle; // this will update the UI

            // the below LOOKS redundant to just updating this.SelectedConversation.Name, but it is needed to ensure that the list box is updated
            // otherwise Angular binding doesn't pick up the change without the below.
            const idx = this.Conversations.findIndex(c => c.ID === this.SelectedConversation?.ID);
            if (idx >= 0) {
              // update our this.Conversations array to reflect the new name. First find the index of the conversation and then get that item and update it
              this.Conversations[idx].Name = this.SelectedConversation.Name;
            }
          }
          await convoDetail.Load(queryResult.UserMessageConversationDetailId); // update the object to load from DB
          const aiDetail = <ConversationDetailEntity>await md.GetEntityObject('Conversation Details');
          await aiDetail.Load(queryResult.AIMessageConversationDetailId) // get record from the database
          this.Messages.push(aiDetail);  

          // we don't create a user notification here in the client, that is done on the server and via GraphQL subscriptions it tells us and we update the UI automatically...
        }
      }
      else {
        const errorMessage = <ConversationDetailEntity>await md.GetEntityObject('Conversation Details');
        errorMessage.NewRecord();
        errorMessage.Role = 'error';
        errorMessage.Message = 'Error took place';
        this.Messages.push(errorMessage);
        this.AllowSend = true;
      }
      this._scrollToBottom = true; // this results in the angular after Viewchecked scrolling to bottom when it's done
      if (this.SelectedConversation)
        this._processingStatus[this.SelectedConversation?.ID] = false;
      this.AllowSend = true;

      // invoke manual resize with a delay to ensure that the scroll to bottom has taken place
      this.sharedService.InvokeManualResize(500);
    }
  } 

  private _detailHtml: any = {};
  public createDetailHtml(detail: ConversationDetailEntity) {
    if (detail.ID !== null && detail.ID !== undefined && detail.ID > 0 && this._detailHtml[detail.ID]) {
      // use cached HTML details for SAVED conversation details, don't do for NEW ONes where ID is null
      return this._detailHtml[detail.ID];
    }
    else {

      let sMessage = '';

      if (detail.Role.trim().toLowerCase() === 'ai') {
        const resultObject = <SkipData>JSON.parse(detail.Message);
        const newId = this.Messages.length;
    
        if (resultObject?.success) {
          sMessage = "Here's the report I've prepared for you, please let me know if you need anything changed or another report!"
          this.addReportToConversation(detail, resultObject, detail.ID);
        }
        else {
          sMessage = `<div class="alert alert-warning" role="alert">
                      <strong>No data returned.</strong>
                      </div>`;
        }
      }
      else {
        sMessage = detail.Message;
      }
      if (detail.ID !== null && detail.ID !== undefined && detail.ID > 0)
        this._detailHtml[detail.ID] = sMessage; // only cache it if it's a saved detail if it is for a new one don't bother yet...
  
      return sMessage;
    }
  }      

  scrollToBottom(): void {
    try {
      this.askSkipPanel.nativeElement.scrollTop = this.askSkipPanel.nativeElement.scrollHeight;
    } catch(err) { 

    }
  }


  protected addReportToConversation(detail: ConversationDetailEntity, result: SkipData, messageId: number) {
    // set a short timeout to allow Angular to render as the div we want to add the grid to won't exist yet otherwise
    setTimeout(() => {
      const componentRef = this.askSkip.viewContainerRef.createComponent(SkipDynamicReportComponent);

      // Pass the data to the new chart
      const report = componentRef.instance;
      report.SkipData = result;
      report.ConversationID = detail.ConversationID
      report.ConversationDetailID = detail.ID;
      if (this.SelectedConversation)
        report.ConversationName = this.SelectedConversation.Name;
  
      this._scrollToBottom = true;

      // // Get a reference to the root element of the component
      // const elementRef = componentRef.location.nativeElement;

      // // Add the class to the element
      // this.renderer.addClass(elementRef, 'skip-dynamic-report-container');

      // Locate the target child div by its ID
      const targetChildDiv = document.getElementById('skip_message_' + messageId);
  
      // Move the component's element to the required location
      this.renderer.appendChild(targetChildDiv, componentRef.location.nativeElement);
    },250);
  }
 
  public userImage() {
    return this.sharedService.CurrentUserImage;
  }

  async ExecuteAskSkipQuery(question: string, viewId: number, SelectedConversation: ConversationEntity | undefined) {
    try {
      const gql = `query ExecuteAskSkipAnalysisQuery($userQuestion: String!, $viewId: Int!, $conversationId: Int!) {
        ExecuteAskSkipAnalysisQuery(UserQuestion: $userQuestion, ViewId: $viewId, ConversationId: $conversationId) {
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
          viewId: viewId
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
      this.Messages.push(errorMessage);
      this.AllowSend = true;
    }
  }

  // async ExecuteAskSkipViewAnalysisQuery(question: string, viewId: number, conversationId: number) {
  //   try {
  //     const gql = `query ExecuteAskSkipViewAnalysisQuery($userQuestion: String!, $viewId: Int!, $conversationId: Int!) {
  //       ExecuteAskSkipViewAnalysisQuery(UserQuestion: $userQuestion, ViewId: $viewId, ConversationId: $conversationId) {
  //         Success
  //         Status
  //         Result
  //         ConversationId 
  //         UserMessageConversationDetailId
  //         AIMessageConversationDetailId
  //       }
  //     }`
  
  //     const result = await GraphQLDataProvider.ExecuteGQL(gql, { userQuestion: question, 
  //                                                                 conversationId: conversationId,
  //                                                                 viewId: viewId});
  //     if (result && result.ExecuteAskSkipViewAnalysisQuery) {
  //       // it worked, get the bits we care about
  //       const resultRaw = result.ExecuteAskSkipViewAnalysisQuery.Result;
  //       const resultObj = JSON.parse(resultRaw);
  //       if (resultObj.success) {
  //         const plotData = resultObj.executionResults.plotData

  //         this.addPlotlyComponent(plotData.data, plotData.layout);  
  //       }
  //       else {
  //         console.error(resultObj.error);
  //         SharedService.Instance.CreateSimpleNotification("Error executing analysis request.", 'error', 5000)
  //       }
  //     }
  //   }
  //   catch (err) {
  //     console.error(err);          
  //   }
  // }
  
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
}
