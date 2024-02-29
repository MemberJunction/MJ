import { AfterViewInit, ChangeDetectorRef, Component, EventEmitter, Input, Output, ViewChild, ViewContainerRef } from '@angular/core';
import { UserInfo } from '@memberjunction/core';
import { ConversationDetailEntity, ConversationEntity } from '@memberjunction/core-entities';
import { SkipAPIAnalysisCompleteResponse, SkipAPIClarifyingQuestionResponse, SkipAPIResponse, SkipResponsePhase } from '@memberjunction/skip-types';
import { SkipDynamicReportComponent } from '../misc/skip-dynamic-report-wrapper';
import { DataContext } from '@memberjunction/data-context';
import { SharedService } from '@memberjunction/ng-shared';
 

@Component({
  selector: 'mj-skip-single-message',
  templateUrl: './skip-single-message.component.html',
  styleUrls: ['./skip-single-message.component.css']
})
export class SkipSingleMessageComponent implements AfterViewInit {  
    @Input() public ConversationRecord!: ConversationEntity;
    @Input() public ConversationDetailRecord!: ConversationDetailEntity;
    @Input() public ConversationUser!: UserInfo;
    @Input() public DataContext!: DataContext;
    @Output() public SuggestedQuestionSelected = new EventEmitter<string>();

    public SuggestedQuestions: string[] = [];

    constructor (private sharedService: SharedService, private cdRef: ChangeDetectorRef) { }

    @ViewChild('reportContainer', { read: ViewContainerRef }) reportContainerRef!: ViewContainerRef;

    private static _detailHtml: any = {};

    private GetHtmlFromCache(detail: ConversationDetailEntity): string | null {
        if (detail.ID !== null && detail.ID !== undefined && detail.ID > 0 && SkipSingleMessageComponent._detailHtml[detail.ID] !== undefined && SkipSingleMessageComponent._detailHtml[detail.ID] !== null) {
            // use cached HTML details for SAVED conversation details, don't do for NEW ONes where ID is null
            return SkipSingleMessageComponent._detailHtml[detail.ID];
        }
        else    
            return null;
    }
    private CacheHtml(detail: ConversationDetailEntity, html: string) {
        // only cache it if it's a saved detail if it is for a new one don't bother yet...
        if (detail.ID !== null && detail.ID !== undefined && detail.ID > 0)
            SkipSingleMessageComponent._detailHtml[detail.ID] = html; 
    }

    ngAfterViewInit() {
        // view has been initialized, so we can load ourselves up now
        //this.CreateDetailHtml();
        this.AddReportToConversation();

        // Manually trigger change detection since the above will cause changes in the view
        // thing is, we have to use ngAfterViewInit to do this, because the view is not ready in the constructor
        // since we are dynamically adding stuff
        this.cdRef.detectChanges();  
    }
 

    public RefreshMessage() {
      this._cachedMessage = null;
    }
    private _cachedMessage: string | null = null;
    public get Message(): string {
      if (this._cachedMessage === null) {
        if (this.ConversationDetailRecord.ID > 0 && this.ConversationDetailRecord.Role.trim().toLowerCase() === 'ai') {
          const resultObject = <SkipAPIResponse>JSON.parse(this.ConversationDetailRecord.Message);
    
          if (resultObject.success) {
            switch (resultObject.responsePhase) {
              case SkipResponsePhase.clarifying_question:
                const clarifyingQuestion = <SkipAPIClarifyingQuestionResponse>resultObject;
                this._cachedMessage = clarifyingQuestion.clarifyingQuestion;
                break;
              case SkipResponsePhase.analysis_complete:
                this._cachedMessage = '';//"Here's the report I've prepared for you, please let me know if you need anything changed or another report!"
                break;
              default:
                this._cachedMessage = "";
            }
          }
          else {
            this._cachedMessage = `I'm having a problem handling the request. If you'd like to try again, please let me know. Also, if this problem persists, please let your administrator know.`;
          }  
        }
        else {
          // this is a temporary message, or the user's message, with just a string in it, don't attempt to JSON parse it
          this._cachedMessage = this.ConversationDetailRecord.Message;
        }
      }
      return this._cachedMessage;
    }
  
    public get AnalysisResult(): SkipAPIAnalysisCompleteResponse | undefined {
      if (this.ConversationDetailRecord.Role.trim().toLowerCase() === 'ai') {
        const resultObject = <SkipAPIResponse>JSON.parse(this.ConversationDetailRecord.Message);
        if (resultObject.success && resultObject.responsePhase === SkipResponsePhase.analysis_complete) {
          return <SkipAPIAnalysisCompleteResponse>resultObject;
        }
      }
    }

    public get IsAIMessage(): boolean {
      return this.ConversationDetailRecord.Role.trim().toLowerCase() === 'ai'
    }

    public RaiseSuggestedQuestionSelectedEvent(question: string) {
      this.SuggestedQuestionSelected.emit(question);
    }

    protected AddReportToConversation() {
      const detail = this.ConversationDetailRecord;

      if (detail.ID > 0 && detail.Role.trim().toLowerCase() === 'ai' ) {
        const resultObject = <SkipAPIResponse>JSON.parse(detail.Message);
  
        if (resultObject.success) {
          if (resultObject.responsePhase ===  SkipResponsePhase.analysis_complete ) {
            const analysisResult = <SkipAPIAnalysisCompleteResponse>resultObject;
            const componentRef = this.reportContainerRef.createComponent(SkipDynamicReportComponent);
    
            // Pass the data to the new chart
            const report = componentRef.instance;
            report.SkipData = analysisResult;
            this.SuggestedQuestions = analysisResult.suggestedQuestions ? analysisResult.suggestedQuestions : [];
            report.DataContext = this.DataContext;
    
            report.ConversationID = detail.ConversationID
            report.ConversationDetailID = detail.ID;
            if (this.ConversationRecord) {
              report.ConversationName = this.ConversationRecord.Name;
            }
          }
        }
      }
    }

    public GetUserImageSource(): string | Blob {
      return this.ConversationDetailRecord.Role.trim().toLowerCase() === 'ai' || this.ConversationDetailRecord.Role.trim().toLowerCase() === 'error' ? 'assets/Skip - Mark Only - Small.png' : this.UserImage
    }
    public GetMessageRowCssClass(): string {
        if (this.ConversationDetailRecord.Role.trim().toLowerCase() === 'ai') {
          if (this.ConversationDetailRecord.ID > 0)
            return 'ai-message';
          else
            return 'ai-message-in-progress';
        }
        else if (this.ConversationDetailRecord.Role.trim().toLowerCase() === 'error') {
          return 'error-message';
        }
        else 
          return 'user-message';
    }    

    public get UserImage() {
        return this.sharedService.CurrentUserImage;
    }    
}
