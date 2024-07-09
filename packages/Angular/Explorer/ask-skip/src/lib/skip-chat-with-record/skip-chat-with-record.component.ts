import { AfterViewInit, Component, Input, ViewChild } from "@angular/core";
import { LogError, Metadata, RunView, CompositeKey } from "@memberjunction/core";
import { ConversationDetailEntity, ConversationEntity, DataContextEntity, DataContextItemEntity } from "@memberjunction/core-entities";
import { GraphQLDataProvider } from "@memberjunction/graphql-dataprovider";
import { ChatComponent, ChatMessage, ChatWelcomeQuestion } from "@memberjunction/ng-chat";
import { SharedService } from "@memberjunction/ng-shared";
import { SkipAPIChatWithRecordResponse } from "@memberjunction/skip-types";

@Component({
    selector: 'mj-skip-chat-with-record',
    templateUrl: './skip-chat-with-record.component.html',
    styleUrls: ['./skip-chat-with-record.component.css']
  })  
export class SkipChatWithRecordComponent implements AfterViewInit {
  @Input() LinkedEntityID!: string;
  @Input() LinkedPrimaryKey: CompositeKey = new CompositeKey();
  
  @ViewChild('mjChat') mjChat!: ChatComponent;

  /**
   * Default welcome questions for Skip are pre-populated, you can override these if you want.
   */
  @Input() public WelcomeQuestions: ChatWelcomeQuestion[] = [
    {
        topLine: "Summarize",
        bottomLine: "Summarize the record, providing a quick snapshot of the information within",
        prompt: "Can you summarize this record for me?"
    },
    {
        topLine: "Patterns",
        bottomLine: "Identify patterns or trends in the data looking for unique insights",
        prompt: "What patterns do you see in this record's data that might be useful to know?"        
    },
    {
        topLine: "Predictions",
        bottomLine: "Make predictions based on the data, including relationships to other records",
        prompt: "What predictions can you make based on this record's data including any available relationships?"
    },
    {
        topLine: "Explain",
        bottomLine: "Explain the record in plain language so that it is simple to understand",
        prompt: "Can you explain this record in plain language so that it is simple to understand?"
    }
  ]

  private _entityName: string | undefined = undefined;
  public get LinkedEntityName(): string {
    if (!this._entityName) {
      const md = new Metadata();
      this._entityName = md.Entities.find(e => e.ID === this.LinkedEntityID)?.Name;
      if (!this._entityName) {
        LogError("Could not find entity name for ID: " + this.LinkedEntityID);
        throw new Error("Could not find entity name for ID: " + this.LinkedEntityID);
      }
    }
    return this._entityName;
  }

  ngAfterViewInit(): void {
    if(!this.LinkedPrimaryKey.KeyValuePairs){
        this.LinkedPrimaryKey.KeyValuePairs = [];
    }
    this.LoadConversation();
  }

  protected _loaded: boolean = false;
  protected async LoadConversation() {
      if (!this._loaded) {
          if (this._conversationId.length === 0) {
              // let's try to lookup the conversation id
              this.mjChat.ShowWaitingIndicator = true;
              const rv = new RunView();
              const md = new Metadata();
              const result = await rv.RunView({
                  EntityName: "Conversations",
                  ExtraFilter: "UserID='" + md.CurrentUser.ID + "' AND LinkedEntityID='" + this.LinkedEntityID + "' AND LinkedRecordID='" + this.LinkedPrimaryKey.Values() + "'",
                  OrderBy: "__mj_CreatedAt DESC" // in case there are more than one get the latest
              })
              if (result && result.Success && result.Results.length > 0) {
                  this._conversationId = result.Results[0].ID;
                  // now, load up the conversation details
                  const result2 = await rv.RunView({
                      EntityName: "Conversation Details",
                      ExtraFilter: "ConversationID=" + this._conversationId,
                      OrderBy: "__mj_CreatedAt ASC"
                  });

                  // now, send the messages to the chat component
                  if (result2 && result2.Success) {
                      for (const cd of result2.Results) {
                          const cde = <ConversationDetailEntity>cd;
                          this.mjChat.SendMessage(cde.Message, 
                                                  cde.Role === 'User' ? md.CurrentUser.Name : "Skip", 
                                                  cde.Role === 'User' ? 'user' : 'ai',
                                                  cde.ID,
                                                  false);
                      }
                  }
              }
          }
          this._loaded = true;
          this.mjChat.ShowWaitingIndicator = false;
      }
  }

  private _conversationId: string = "";
  public async HandleChatMessageAdded(message: ChatMessage) {
      if (message.senderType === 'user') {
          // send messages to Skip from here using graphql
          try {
              this.mjChat.ShowWaitingIndicator = true;
              const gql = `query ExecuteAskSkipRecordChatQuery($userQuestion: String!, $conversationId: String!, $entityName: String!, $compositeKey: CompositeKeyInputType!) {
                  ExecuteAskSkipRecordChat(UserQuestion: $userQuestion, ConversationId: $conversationId, EntityName: $entityName, CompositeKey: $compositeKey) {
                      Success
                      Status
                      Result
                      ConversationId
                      UserMessageConversationDetailId
                      AIMessageConversationDetailId
                  }
              }`
              const result = await GraphQLDataProvider.ExecuteGQL(gql, { 
                  userQuestion: message.message, 
                  entityName: this.LinkedEntityName,
                  conversationId: this._conversationId,
                    compositeKey: this.LinkedPrimaryKey.Copy()
              });
      
              if (result?.ExecuteAskSkipRecordChat?.Success) {
                  const resultObj = <SkipAPIChatWithRecordResponse>JSON.parse(result.ExecuteAskSkipRecordChat.Result)
                  this._conversationId = result.ExecuteAskSkipRecordChat.ConversationId;
                  this.mjChat.SendMessage(resultObj.response, 'skip', 'ai', result.ExecuteAskSkipRecordChat.AIMessageConversationDetailId, false);
              }
              this.mjChat.ShowWaitingIndicator = false;
          }
          catch (err) {
              this.mjChat.ShowWaitingIndicator = false;
              SharedService.Instance.CreateSimpleNotification("Error communicating with Skip: " + err, "error");
              console.error(err);          
          }                        
      }
  }    
  
  public async HandleClearChat() {
      if (this._conversationId.length > 0) {
          this.mjChat.ShowWaitingIndicator = true;
          // first get rid of all conversation details, but don't kill the conversation itself, no need
          const md = new Metadata();
          const rv = new RunView();
          const result = await rv.RunView({
              EntityName: "Conversation Details",
              ExtraFilter: "ConversationID='" + this._conversationId + "'",
              ResultType: 'entity_object'
          });
          if (result && result.Success) {
            const tg = await md.CreateTransactionGroup();
            for (const cd of result.Results) {
                const cdE = <ConversationDetailEntity>cd;
                cdE.TransactionGroup = tg;
                cdE.Delete();  // dont await because inside a TG
            }
            const convoEntity = await md.GetEntityObject<ConversationEntity>("Conversations");
            await convoEntity.Load(this._conversationId);
            if (convoEntity.DataContextID) {
                // we have a data context for the conversation, so let's delete it, starting with the items
                const resultDCI = await rv.RunView({
                    EntityName: "Data Context Items",
                    ExtraFilter: "DataContextID='" + this._conversationId + "'",
                    ResultType: 'entity_object'
                });
                for (const dciEntity of resultDCI.Results) {
                    const dci = <DataContextItemEntity>dciEntity;
                    dci.TransactionGroup = tg;
                    dci.Delete(); // dont await because inside a TG
                }
      
                // now delete the data context itself
                const dcEntity = await md.GetEntityObject<DataContextEntity>("Data Contexts");
                await dcEntity.Load(convoEntity.DataContextID);
                dcEntity.TransactionGroup = tg;
                dcEntity.Delete(); // dont await because inside a TG    
            }

            // now delete the conversation itself
            convoEntity.TransactionGroup = tg;
            convoEntity.Delete(); // dont await because inside a TG
            
            await tg.Submit();

            this._conversationId = "";
            this.mjChat.ClearAllMessages();
          }
          this.mjChat.ShowWaitingIndicator = false;
      }
  }
}