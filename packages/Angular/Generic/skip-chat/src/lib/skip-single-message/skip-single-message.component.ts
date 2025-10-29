import { AfterViewInit, ChangeDetectorRef, Component, ComponentRef, EventEmitter, Input, OnDestroy, Output, ViewChild, ViewContainerRef } from '@angular/core';
import { ConversationArtifactEntity, ConversationArtifactVersionEntity } from '@memberjunction/core-entities';
import { IMetadataProvider, LogError, Metadata, RunView, RunViewParams, UserInfo } from '@memberjunction/core';
import { ConversationDetailEntity, ConversationEntity } from '@memberjunction/core-entities';
import { SkipAPIAnalysisCompleteResponse, SkipAPIClarifyingQuestionResponse, SkipAPIResponse, SkipResponsePhase } from '@memberjunction/skip-types';
import { SkipDynamicReportWrapperComponent } from '../dynamic-report/skip-dynamic-report-wrapper';
import { DataContext } from '@memberjunction/data-context';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { Meta } from '@angular/platform-browser';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { DrillDownInfo } from '../drill-down-info';
 

@Component({
  selector: 'mj-skip-single-message',
  templateUrl: './skip-single-message.component.html',
  styleUrls: ['./skip-single-message.component.css']
})
export class SkipSingleMessageComponent  extends BaseAngularComponent implements AfterViewInit, OnDestroy {  
    @Input() public ConversationRecord!: ConversationEntity;
    @Input() public ConversationDetailRecord!: ConversationDetailEntity;
    @Input() public ConversationUser!: UserInfo;
    @Input() public DataContext!: DataContext;
    @Input() public ConversationMessages!: ConversationDetailEntity[];
    /**
     * This variable should be set by the component instantiating this one, it should be bound to the state
     * of the conversation processing, so that this component can handle its internal functionality correctly,
     * for example when the conversation is processing, don't show the buttons to edit or delete the message
     */
    @Input() public ConversationProcessing: boolean = false;
    /**
     * Set this property in order to set the Skip logo. This can either be a URL or a Blob
     */
    @Input() public SkipMarkOnlyLogoURL: string = "assets/skip-icon.svg";
    /**
     * Set this property in order to set the user image. This can either be a URL or a Blob
     */
    @Input() public UserImage: string | Blob | undefined = undefined;
    /**
     * Default user image to use if the user image is not set
     */
    @Input() public DefaultUserImage: string | Blob | undefined = undefined;

    /**
     * Optional timestamp when the message was loaded/created
     * If not provided, it will be set to Date.now() in ngAfterViewInit
     */
    @Input() public loadTime: Date | undefined = undefined;

    /**
     * If set to true, user messages will be shown with a button to allow delete/edit
     */
    @Input() public ShowMessageEditPanel: boolean = true;

    /**
     * If set to true, AI messages that are the last in the conversation will show thumbs up/down rating
     */
    @Input() public ShowMessageRating: boolean = true;

    /**
     * If set to true, messages with linked artifacts will show an artifact indicator
     */
    @Input() public ShowArtifactIndicator: boolean = true;

    /** 
     * Indicates if the message is currently being rated and saved to the database
     */
    public RatingBeingSaved: boolean = false;

    /**
     * This is an internal property that is turned on just after a user succesfully rates a message, and is never true otherwise. This allows the UI to show a thank you message for the rating.
     */
    public UserJustRated: boolean = false;
    
    /**
     * Controls the visibility of the feedback dialog
     */
    public ShowingFeedbackDialog: boolean = false;
    
    /**
     * Stores the rating value selected by the user before submitting feedback
     */
    private SelectedRating: number | null = null;
    
    /**
     * Stores the feedback text entered by the user
     */
    public UserFeedbackText: string = '';
    
    /**
     * The title to show in the feedback dialog based on the rating
     */
    public FeedbackDialogTitle: string = 'Share more feedback';

    /**
     * Name of the artifact associated with this message, if any
     */
    public ArtifactName: string | null = null;

    /**
     * Description of the artifact associated with this message, if any
     */
    public ArtifactDescription: string | null = null;

    /**
     * Version of the artifact associated with this message, if any
     */
    public ArtifactVersion: number | null = null;

    @Output() public SuggestedQuestionSelected = new EventEmitter<string>();
    @Output() public SuggestedAnswerSelected = new EventEmitter<string>();
    /**
     * Event emitted when the user clicks on a matching report and the application needs to handle the navigation
     */
    @Output() NavigateToMatchingReport = new EventEmitter<string>();

    /**
     * This event fires whenever a new report is created.
     */
    @Output() NewReportCreated = new EventEmitter<string>();

    /**
     * This event fires when the user is requesting to edit a message, the container of this component will handle
     */
    @Output() EditMessageRequested = new EventEmitter<ConversationDetailEntity>();
    /**
     * This event fires when the user is requesting to delete a message, the container of this component will handle
     */
    @Output() DeleteMessageRequested = new EventEmitter<ConversationDetailEntity>();

    /**
     * This event fires whenever a drill down is requested within a given report.
     */
    @Output() DrillDownEvent = new EventEmitter<DrillDownInfo>();
    
    /**
     * This event fires when the user clicks on an artifact indicator to view the artifact
     */
    @Output() ArtifactSelected = new EventEmitter<any>();

    public SuggestedQuestions: string[] = [];
    public SuggestedAnswers: string[] = [];

    @Input() public ShowSuggestedQuestions: boolean = true;
    @Input() public HideSuggestedQuestionsAfterClick: boolean = true;

    @Input() public ShowSuggestedAnswers: boolean = true;
    @Input() public HideSuggestedAnswersAfterClick: boolean = true;

    public SuggestedQuestionsClicked: boolean = false;
    public SuggestedAnswersClicked: boolean = false;

    constructor (private cdRef: ChangeDetectorRef, private notificationService: MJNotificationService ) { 
      super();
    }

    @ViewChild('reportContainer', { read: ViewContainerRef }) reportContainerRef!: ViewContainerRef;

    // Track dynamically created report component for cleanup
    private _reportComponentRef: ComponentRef<any> | null = null;

    private static _detailHtml: any = {};


    private _loadTime: number = Date.now(); // Initialize with current time to avoid 0
    public get ElapsedTimeSinceLoad(): number {
      return Date.now() - this._loadTime;
    }

    /**
     * Returns the elapsed time since load as a nicely formatted string taking the value of ElapsedTimeSinceLoad and instead of having it in milliseconds,
     * showing as a string like "5 seconds" or "1:05" which will update every second
     */
    public get ElapsedTimeSinceLoadFormatted(): string {
      return this._elapsedTimeFormatted;
    }

    /**
     * Starts the elapsed time updater interval
     */
    private startElapsedTimeUpdater(): void {
      // Defer the initial setting to avoid change detection issues
      Promise.resolve().then(() => {
        this._elapsedTimeFormatted = this.FormatElapsedTime(this.ElapsedTimeSinceLoad);
        this.cdRef.detectChanges();
      });
      
      // Start the interval to update every second
      if (this._elapsedTimeInterval === null) {
        this._elapsedTimeInterval = setInterval(() => {
          this._elapsedTimeFormatted = this.FormatElapsedTime(this.ElapsedTimeSinceLoad);
          // Use Promise.resolve().then() to schedule change detection in the next microtask
          // This prevents ExpressionChangedAfterItHasBeenCheckedError
          Promise.resolve().then(() => {
            this.cdRef.detectChanges();
          });
        }, 1000);
      }
    }

    private _elapsedTimeFormatted: string = "(0:00 elapsed)"; // Initialize with a default value
    private _elapsedTimeInterval: any = null;
    protected FormatElapsedTime(elapsedTime: number): string {
      let seconds = Math.floor(elapsedTime / 1000);
      let minutes = Math.floor(seconds / 60);
      seconds = seconds % 60;
      let hours = Math.floor(minutes / 60);
      minutes = minutes % 60;
      let formattedTime = (hours > 0 ? hours + ":" : "") + (minutes < 10 && hours > 0 ? "0" : "") + minutes + ":" + (seconds < 10 ? "0" : "") + seconds;
      return `(${formattedTime} elapsed)`;
    }

    private GetHtmlFromCache(detail: ConversationDetailEntity): string | null {
        if (detail.ID !== null && detail.ID !== undefined && detail.ID.length > 0 && SkipSingleMessageComponent._detailHtml[detail.ID] !== undefined && SkipSingleMessageComponent._detailHtml[detail.ID] !== null) {
            // use cached HTML details for SAVED conversation details, don't do for NEW ONes where ID is null
            return SkipSingleMessageComponent._detailHtml[detail.ID];
        }
        else    
            return null;
    }
    private CacheHtml(detail: ConversationDetailEntity, html: string) {
        // only cache it if it's a saved detail if it is for a new one don't bother yet...
        if (detail.ID !== null && detail.ID !== undefined && detail.ID.length > 0)
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

        // Set _loadTime to the provided loadTime if available, otherwise use current time
        this._loadTime = this.loadTime !== undefined ? this.loadTime instanceof Date ? this.loadTime.getTime() : this.loadTime : Date.now();
        
        // Initialize elapsed time formatting and start the update interval
        this.startElapsedTimeUpdater();
        
        // Load artifact info if available
        if (this.HasArtifact) {
            this.loadArtifactInfo();
        }
    }
 

    public RefreshMessage() {
      this._cachedMessage = null;
    }
    private _cachedMessage: string | null = null;
    public get Message(): string {
      if (this._cachedMessage === null) {
        if (this.ConversationDetailRecord.ID && this.ConversationDetailRecord.ID.length > 0 && 
            this.ConversationDetailRecord.Role && this.ConversationDetailRecord.Role.trim().toLowerCase() === 'ai') {
          const resultObject = <SkipAPIResponse>JSON.parse(this.ConversationDetailRecord.Message);
    
          if (resultObject.success) {
            switch (resultObject.responsePhase) {
              case SkipResponsePhase.clarifying_question:
                const clarifyingQuestion = <SkipAPIClarifyingQuestionResponse>resultObject;
                this._cachedMessage = clarifyingQuestion.clarifyingQuestion;
                break;
              case SkipResponsePhase.analysis_complete:
                // check to see if we have an artifact, if we do, then we want _cachedMessage to be the explanation of the report, otherwise we want it to be empty
                if (this.ConversationDetailRecord.ArtifactID && this.ConversationDetailRecord.ArtifactID.length > 0) {
                  this._cachedMessage = (<SkipAPIAnalysisCompleteResponse>resultObject).userExplanation || '';
                }
                else {
                  this._cachedMessage = '';//"Here's the report I've prepared for you, please let me know if you need anything changed or another report!"
                }
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
      if (this.IsAIMessage) {
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
      this.SuggestedQuestionsClicked = true;
    }
    public RaiseSuggestedAnswerSelectedEvent(question: string) {
      this.SuggestedAnswerSelected.emit(question);
      this.SuggestedAnswersClicked = true;
    }
    public RaiseMessageDeleteRequest() {
      this.DeleteMessageRequested.emit(this.ConversationDetailRecord);
    }
    public RaiseMessageEditRequest() {
      this.EditMessageRequested.emit(this.ConversationDetailRecord);
    }

    /**
     * Shows the feedback dialog with the appropriate title based on the rating
     * @param rating The rating selected by the user (10 for thumbs up, 1 for thumbs down)
     */
    public ShowFeedbackDialog(rating: number): void {
      if (!this.ConversationDetailRecord || !this.IsAIMessage) {
        return;
      }
      
      this.SelectedRating = rating;
      this.FeedbackDialogTitle = rating === 10 ? 
        'Thanks for the positive feedback! Would you like to share more?' : 
        'Thanks for your feedback. What could be improved?';
      this.ShowingFeedbackDialog = true;
    }
    
    /**
     * Closes the feedback dialog without saving feedback
     */
    public CancelFeedback(): void {
      // If the user cancels, still save the rating but without feedback
      this.RateMessage(this.SelectedRating, '');
      this.UserFeedbackText = '';
      this.ShowingFeedbackDialog = false;
    }
    
    /**
     * Submits the feedback and rating
     */
    public SubmitFeedback(): void {
      // Save both the rating and feedback text
      this.RateMessage(this.SelectedRating, this.UserFeedbackText);
      this.UserFeedbackText = '';
      this.ShowingFeedbackDialog = false;
    }

    /**
     * Rate the AI response with either thumbs up (10) or thumbs down (1)
     * @param rating The rating to assign, 10 for thumbs up, 1 for thumbs down
     * @param feedback Optional text feedback from the user
     */
    public async RateMessage(rating: number | null, feedback: string = ''): Promise<void> {
      if (!this.ConversationDetailRecord || !this.IsAIMessage) {
        return;
      }

      try {
        this.RatingBeingSaved = true;
        // Update the UserRating property in the local object
        this.ConversationDetailRecord.UserRating = rating;
        
        // Update the UserFeedback property if provided
        if (feedback) {
          this.ConversationDetailRecord.UserFeedback = feedback;
        }

        let objToSave = this.ConversationDetailRecord;
        
        if (undefined === this.ConversationDetailRecord.Save) {
          // this means that the current object is not a ConversationDetailEntity, so we can't save it directly, we must load an object first
          const p = this.ProviderToUse;
          const savedID = this.ConversationDetailRecord.ID;
          objToSave = await p.GetEntityObject<ConversationDetailEntity>("Conversation Details", p.CurrentUser);
          await objToSave.Load(savedID);
          objToSave.UserRating = rating;
          
          // Set feedback if provided
          if (feedback) {
            objToSave.UserFeedback = feedback;
          }
          // now we have a real object, we can save it below
        }

        // Save the updated record
        if (await objToSave.Save()) {
          // Force change detection
          this.UserJustRated = true; // show the thank you message

          // set a timer to wait for 10 seconds and after that we'll set the UserJustRated to false
          setTimeout(() => {
            this.UserJustRated = false;
          }, 10000);
        }
        else {
          throw objToSave.LatestResult.CompleteMessage;
        }
      } catch (error) {
        LogError('Error rating message:' + error);

        this.notificationService.CreateSimpleNotification('Error saving feedback', "error", 3500);
      } finally {
        this.RatingBeingSaved = false;
      }
    }

    protected AddReportToConversation() {
      const detail = this.ConversationDetailRecord;

      if (this.reportContainerRef && detail?.ID?.length > 0 && detail.Role.trim().toLowerCase() === 'ai' ) {
        const resultObject = <SkipAPIResponse>JSON.parse(detail.Message);
  
        if (resultObject.success) {
          if (resultObject.responsePhase ===  SkipResponsePhase.analysis_complete ) {
            const analysisResult = <SkipAPIAnalysisCompleteResponse>resultObject;
            const componentRef = this.reportContainerRef.createComponent(SkipDynamicReportWrapperComponent);            
            
            // CRITICAL: Track the component reference for cleanup
            this._reportComponentRef = componentRef;
            
            // Pass the data to the new report
            const report = componentRef.instance;
            report.NavigateToMatchingReport.subscribe((reportID: string) => {
              this.NavigateToMatchingReport.emit(reportID); // bubble up
            });
            report.NewReportCreated.subscribe((reportID: string) => {
              this.NewReportCreated.emit(reportID); // bubble up
            });
            report.DrillDownEvent.subscribe((drillDownInfo: any) => {
              this.DrillDownEvent.emit(drillDownInfo); // bubble up
            });
            report.Provider = this.ProviderToUse;
            report.SkipData = analysisResult;
            this.SuggestedQuestions = analysisResult.suggestedQuestions ? analysisResult.suggestedQuestions : [];
          
            report.DataContext = this.DataContext;
            report.AllowDrillDown = false; // we don't want this within the chat, it's too much
    
            report.ConversationID = detail.ConversationID
            report.ConversationDetailID = detail.ID;
            if (this.ConversationRecord) {
              report.ConversationName = this.ConversationRecord.Name;
            }
          }
          else if (resultObject.responsePhase === SkipResponsePhase.clarifying_question ) {
            const clarifyingQuestion = <SkipAPIClarifyingQuestionResponse>resultObject;
            this.SuggestedAnswers = clarifyingQuestion.suggestedAnswers ? clarifyingQuestion.suggestedAnswers : [];
          }
        }
      }
    }

    public GetUserImageSource(): string | Blob | undefined {
      return this.IsAIMessage || this.ConversationDetailRecord.Role.trim().toLowerCase() === 'error' ? 
                this.SkipMarkOnlyLogoURL : 
                this.UserImage
    }
    public GetMessageRowCssClass(): string {
        if (this.ConversationDetailRecord.Role.trim().toLowerCase() === 'ai') {
          if (this.ConversationDetailRecord.ID.length > 0)
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

    public get IsTemporaryMessage(): boolean {
      if (this.ConversationDetailRecord?.Role?.trim().toLowerCase() === 'ai') {
        if (this.ConversationDetailRecord.ID?.length > 0)
          return false;
        else
          return true;
      }
      else
        return false;
    }

    public get IsFirstMessageInConversation(): boolean {
      const result = this.ConversationMessages.indexOf(this.ConversationDetailRecord) === 0;
      return result;
    }
    public get IsLastMessageInConversation(): boolean {
      const result = this.ConversationMessages.indexOf(this.ConversationDetailRecord) === this.ConversationMessages.length - 1;
      return result;
    }

    /**
     * Determines if we should show the rating UI for this message
     */
    public get ShouldShowRating(): boolean {
      return this.ShowMessageRating && 
             this.IsAIMessage && 
             this.IsLastMessageInConversation && 
             !this.ConversationProcessing &&
             this.ConversationDetailRecord.UserRating === null &&
             !!this.AnalysisResult && // only show this if we have an analysis result meaning this is a message that shows a report. we don't want to ask for ratings in other AI messages 
             !this.RatingBeingSaved;
    }

    /**
     * Gets a descriptive string based on the user rating
     */
    public get RatingStatusText(): string {
      if (this.ConversationDetailRecord.UserRating === null) {
        return '';
      } else if (this.ConversationDetailRecord.UserRating === 10) {
        return 'Thanks for the positive feedback!';
      } else {
        return 'Thanks for your feedback!';
      }
    }

    /**
     * Determines if the current message has an associated artifact
     */
    public get HasArtifact(): boolean {
      return this.ShowArtifactIndicator && 
             !!this.ConversationDetailRecord && 
             !!this.ConversationDetailRecord.ArtifactID && 
             this.ConversationDetailRecord.ArtifactID.length > 0;
    }
  
    /**
     * Emits the ArtifactSelected event with the artifact ID and version ID
     */
    public onArtifactIndicatorClick(): void {
      if (this.HasArtifact) {
        this.ArtifactSelected.emit({
          artifactId: this.ConversationDetailRecord.ArtifactID,
          artifactVersionId: this.ConversationDetailRecord.ArtifactVersionID,
          messageId: this.ConversationDetailRecord.ID,
          name: this.ArtifactName,
          description: this.ArtifactDescription
        });
      }
    }

    /**
     * Returns a formatted string for the completion time if available
     */
    public get CompletionTimeFormatted(): string | null {
      if (this.IsAIMessage && this.ConversationDetailRecord.CompletionTime) {
        const milliseconds = this.ConversationDetailRecord.CompletionTime;
        
        // Format based on duration
        if (milliseconds < 1000) {
          return `Generated in less than a second`;
        } else if (milliseconds < 60000) {
          const seconds = Math.floor(milliseconds / 1000);
          return `Generated in ${seconds} ${seconds === 1 ? 'second' : 'seconds'}`;
        } else {
          const minutes = Math.floor(milliseconds / 60000);
          const seconds = Math.floor((milliseconds % 60000) / 1000);
          
          if (seconds === 0) {
            return `Generated in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
          } else {
            return `Generated in ${minutes}m ${seconds}s`;
          }
        }
      }
      return null;
    }
    
    /**
     * Returns whether this message should display a completion time
     */
    public get ShouldShowCompletionTime(): boolean {
      return this.IsAIMessage && 
             !this.IsTemporaryMessage && 
             !!this.ConversationDetailRecord.CompletionTime;
    }

    /**
     * Loads the artifact information if available
     */
    private async loadArtifactInfo(): Promise<void> {
      if (!this.HasArtifact || !this.ConversationDetailRecord.ArtifactID) {
        return;
      }

      try {
        const provider = this.ProviderToUse;
        const rv = new RunView(this.RunViewToUse);
        const params: RunViewParams[] = [                  
          {
            EntityName: 'MJ: Conversation Artifacts',
            ExtraFilter: "ID = '" + this.ConversationDetailRecord.ArtifactID + "'",
            ResultType: 'simple'
          }
        ];
        if (this.ConversationDetailRecord.ArtifactVersionID) {
          params.push(
            {
              EntityName: 'MJ: Conversation Artifact Versions',
              ExtraFilter: "ID = '" + this.ConversationDetailRecord.ArtifactVersionID + "'",
              ResultType: 'simple'
            }
          );
        }
        const results = await rv.RunViews(params, this.ProviderToUse.CurrentUser);
        if (results) {
          const artifactResult = results[0];
          if (artifactResult && artifactResult.Results?.length > 0) {
            const artifact = artifactResult.Results[0];
            if (artifact) {
              this.ArtifactName = artifact.Name;
              this.ArtifactDescription = artifact.Description;
            }
          }
          if (this.ConversationDetailRecord.ArtifactVersionID) {
            const versionResult = results[1];
            if (versionResult && versionResult.Results?.length > 0) {
              const version = <ConversationArtifactVersionEntity>versionResult.Results[0];
              if (version) {
                this.ArtifactVersion = version.Version;
              }
            }
          }
        }
      } catch (err) {
        console.error('Error loading artifact information', err);
      }
    }

    ngOnDestroy(): void {
      // CRITICAL: Clean up dynamically created report component to prevent zombie components
      if (this._reportComponentRef) {
        this._reportComponentRef.destroy();
        this._reportComponentRef = null;
      }
      
      // Clear the view container to ensure no lingering references
      if (this.reportContainerRef) {
        this.reportContainerRef.clear();
      }
      
      // Clean up the elapsed time interval to prevent memory leaks
      if (this._elapsedTimeInterval !== null) {
        clearInterval(this._elapsedTimeInterval);
        this._elapsedTimeInterval = null;
      }
      
      // Clear arrays and objects
      this.SuggestedQuestions.length = 0;
      this.SuggestedAnswers.length = 0;
      
      // Reset state
      this._cachedMessage = null;
      this.ArtifactName = null;
      this.ArtifactDescription = null;
      this.ArtifactVersion = null;
      this.UserFeedbackText = '';
      this._elapsedTimeFormatted = '';
    }
}
