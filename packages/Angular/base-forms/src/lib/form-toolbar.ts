import { Component, Input, ViewChild } from '@angular/core';
import { BaseFormComponent } from './base-form-component';
import { ChatComponent, ChatMessage } from '@memberjunction/ng-chat';
import { SharedService } from '@memberjunction/ng-shared';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { Metadata, PrimaryKeyValue, RunView, TransactionGroupBase } from '@memberjunction/core';
import { ConversationDetailEntity } from '@memberjunction/core-entities';
import { SkipAPIChatWithRecordResponse } from '@memberjunction/skip-types';


@Component({
    selector: 'mj-form-toolbar',
    styles: [
                `button { margin-right: 10px; }`, 
                `.button-text { margin-left: 7px; }`, 
                `.toolbar-container { border-bottom: solid 1px lightgray; padding-bottom: 10px; margin-bottom: 5px; }`
            ],
    template: `
        <div class="toolbar-container">
            @if (!form.EditMode) {
                @if (form.UserCanEdit) {
                    <button kendoButton (click)="form.StartEditMode()" title="Edit Record">
                        <span class="fa-solid fa-pen-to-square"></span>
                        <span class="button-text">Edit</span>
                    </button> 
                }
                @if (form.FavoriteInitDone) {
                    @if (form.IsFavorite) {
                        <button kendoButton (click)="form.RemoveFavorite()" title="Remove Favorite">
                            <span class="fa-solid fa-star"></span>
                        </button> 
                    }
                    @else {
                        <button kendoButton (click)="form.MakeFavorite()" title="Make Favorite">
                            <span class="fa-regular fa-star"></span>
                        </button> 
                    }
                }
            }
            @else {
                <button kendoButton (mouseup)="saveRecord($event)" title="Save Record">
                    <span class="fa-solid fa-floppy-disk"></span>
                    <span class="button-text">Save</span>
                </button> 
                <button kendoButton (click)="form.CancelEdit()" title="Cancel Edit">
                    <span class="fa-solid fa-rotate-left"></span>
                    <span class="button-text">Cancel</span>
                </button> 
                @if (form.record.Dirty) {
                    <button kendoButton (click)="form.ShowChanges()" title="Fields you have changed">
                        <span class="fa-solid fa-clipboard-list"></span>
                        <span class="button-text">Changes</span>
                    </button> 
                }
            }
            @if (form.EntityInfo?.TrackRecordChanges) {
                <button kendoButton (click)="form.handleHistoryDialog()" title="Show History">
                    <span class="fa-solid fa-business-time"></span>
                    <span class="button-text">History</span>
                </button> 
            }
            @if (ShowSkipChatButton) {
                <button kendoButton (click)="ShowSkipChat()" title="Discuss this record with Skip">
                    <span class="fa-regular fa-comment-dots"></span>
                </button> 
            }
            <!-- doing this via hidden so the component isn't destroyed and recreated -->
            <mj-chat 
                (MessageAdded)="HandleChatMessageAdded($event)" 
                (ClearChatRequested)="HandleClearChat()"
                #mjChat
                [hidden]="!SkipChatVisible" 
            ></mj-chat>
            @if (form.isHistoryDialogOpen) {
                <mj-record-changes [record]="form.record" (dialogClosed)="form.handleHistoryDialog()"></mj-record-changes>
            }
        </div>
    `
})
export class FormToolbarComponent {
    @Input() ShowSkipChatButton: boolean = true;
    @Input() form!: BaseFormComponent;

    @ViewChild('mjChat') mjChat!: ChatComponent;

    public saveRecord(event: MouseEvent): void {
        // Ensure the button takes focus
        const button = event.target as HTMLElement;
        button.focus();
      
        // Proceed to call your save record function
        this.form.SaveRecord(true);
    }

    public SkipChatVisible: boolean = false;
    public ShowSkipChat(): void {
        this.SkipChatVisible = !this.SkipChatVisible;
        if (this.SkipChatVisible) {
            this.LoadConversation();
        }
        SharedService.Instance.InvokeManualResize();
    }   

    protected _loaded: boolean = false;
    protected async LoadConversation() {
        if (!this._loaded) {
            if (this._conversationId <= 0) {
                // let's try to lookup the conversation id
                this.mjChat.ShowWaitingIndicator = true;
                const rv = new RunView();
                const md = new Metadata();
                const result = await rv.RunView({
                    EntityName: "Conversations",
                    ExtraFilter: "UserID=" + md.CurrentUser.ID + " AND LinkedEntityID=" + this.form.EntityInfo?.ID + " AND LinkedRecordID=" + this.form.record.PrimaryKeys[0].Value,
                    OrderBy: "CreatedAt DESC" // in case there are more than one get the latest
                })
                if (result && result.Success && result.Results.length > 0) {
                    this._conversationId = result.Results[0].ID;
                    // now, load up the conversation details
                    const result2 = await rv.RunView({
                        EntityName: "Conversation Details",
                        ExtraFilter: "ConversationID=" + this._conversationId,
                        OrderBy: "CreatedAt ASC"
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

    private _conversationId: number = 0;
    public async HandleChatMessageAdded(message: ChatMessage) {
        if (message.senderType === 'user') {
            // send messages to Skip from here using graphql
            try {
                this.mjChat.ShowWaitingIndicator = true;
                const gql = `query ExecuteAskSkipRecordChatQuery($userQuestion: String!, $conversationId: Int!, $entityName: String!, $primaryKeys: [PrimaryKeyValueInputType!]!) {
                    ExecuteAskSkipRecordChat(UserQuestion: $userQuestion, ConversationId: $conversationId, EntityName: $entityName, PrimaryKeys: $primaryKeys) {
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
                    entityName: this.form.EntityInfo?.Name,
                    conversationId: this._conversationId,
                    primaryKeys: this.form.record.PrimaryKeys.map(pk => <PrimaryKeyValue>{FieldName: pk.Name, Value: pk.Value.toString()}),
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
                alert ("Error communicating with Skip: " + err);
                console.error(err);          
            }                        
        }
    }    
    
    public async HandleClearChat() {
        if (this._conversationId > 0) {
            // first get rid of all conversation details, but don't kill the conversation itself, no need
            const md = new Metadata();
            const rv = new RunView();
            const result = await rv.RunView({
                EntityName: "Conversation Details",
                ExtraFilter: "ConversationID=" + this._conversationId,
                OrderBy: "CreatedAt ASC",
                ResultType: 'entity_object'
            });
            if (result && result.Success && result.Results.length > 0) {
                const tg = await md.CreateTransactionGroup();
                for (const cd of result.Results) {
                    const cdE = <ConversationDetailEntity>cd;
                    cdE.TransactionGroup = tg;
                    cdE.Delete();  // dont await because inside a TG
                }
                await tg.Submit();
                this.mjChat.ClearAllMessages();
            }
        }
    }
}
