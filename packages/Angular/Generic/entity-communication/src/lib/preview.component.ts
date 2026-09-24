import { Component, Output, EventEmitter, Input, OnInit } from '@angular/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { CommunicationEngineBase, Message, ProcessedMessage } from '@memberjunction/communication-types';
import { EntityInfo, RunView, RunViewParams } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { MJTemplateContentEntity, MJTemplateEntityExtended } from '@memberjunction/core-entities';
import { EntityCommunicationParams } from '@memberjunction/entity-communications-base';
import { EntityCommunicationsEngineClient } from '@memberjunction/entity-communications-client';
import { TemplateEngineBase } from '@memberjunction/templates-base-types';

/**
 * Component for previewing in the UI what a communication will look like when sent using a specific entity and parameters for running a view that drive a dataset against a given template
 */
@Component({
  standalone: false,
  selector: 'mj-entity-communications-preview',
  templateUrl: './preview.component.html',
  styleUrls: ['./preview.component.css']
})
export class EntityCommunicationsPreviewComponent extends BaseAngularComponent implements OnInit  {
  @Input() TemplateFilter: string | undefined;

  /** @deprecated Use {@link TemplateFilter}. */
  @Input() set templateFilter(value: string | undefined) {
    this.TemplateFilter = value;
  }
  /** @deprecated Use {@link TemplateFilter}. */
  get templateFilter(): string | undefined {
    return this.TemplateFilter;
  }
  @Input() EntityInfo: EntityInfo | undefined;

  /** @deprecated Use {@link EntityInfo}. */
  @Input() set entityInfo(value: EntityInfo | undefined) {
    this.EntityInfo = value;
  }
  /** @deprecated Use {@link EntityInfo}. */
  get entityInfo(): EntityInfo | undefined {
    return this.EntityInfo;
  }
  @Input() RunViewParams: RunViewParams | undefined;

  /** @deprecated Use {@link RunViewParams}. */
  @Input() set runViewParams(value: RunViewParams | undefined) {
    this.RunViewParams = value;
  }
  /** @deprecated Use {@link RunViewParams}. */
  get runViewParams(): RunViewParams | undefined {
    return this.RunViewParams;
  }
  @Output() TemplateSelected = new EventEmitter<MJTemplateEntityExtended>();

  /**
   * @deprecated Use {@link TemplateSelected}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (templateSelected) keeps working. Must stay AFTER TemplateSelected: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() templateSelected = this.TemplateSelected;

  Templates: MJTemplateEntityExtended[] = [];

  /** @deprecated Use {@link Templates}. */
  get templates(): MJTemplateEntityExtended[] {
    return this.Templates;
  }
  /** @deprecated Use {@link Templates}. */
  set templates(value: MJTemplateEntityExtended[]) {
    this.Templates = value;
  }
  SelectedTemplate: MJTemplateEntityExtended | null = null;

  /** @deprecated Use {@link SelectedTemplate}. */
  get selectedTemplate(): MJTemplateEntityExtended | null {
    return this.SelectedTemplate;
  }
  /** @deprecated Use {@link SelectedTemplate}. */
  set selectedTemplate(value: MJTemplateEntityExtended | null) {
    this.SelectedTemplate = value;
  }
  Step: number = 1;

  /** @deprecated Use {@link Step}. */
  get step(): number {
    return this.Step;
  }
  /** @deprecated Use {@link Step}. */
  set step(value: number) {
    this.Step = value;
  }

  public PreviewMessages: ProcessedMessage[] = [];

  /** @deprecated Use {@link PreviewMessages}. */
  public get previewMessages(): ProcessedMessage[] {
    return this.PreviewMessages;
  }
  /** @deprecated Use {@link PreviewMessages}. */
  public set previewMessages(value: ProcessedMessage[]) {
    this.PreviewMessages = value;
  }
  CurrentMessageIndex: number = 0;

  /** @deprecated Use {@link CurrentMessageIndex}. */
  get currentMessageIndex(): number {
    return this.CurrentMessageIndex;
  }
  /** @deprecated Use {@link CurrentMessageIndex}. */
  set currentMessageIndex(value: number) {
    this.CurrentMessageIndex = value;
  }
  public Loading: boolean = false;

  /** @deprecated Use {@link Loading}. */
  public get loading(): boolean {
    return this.Loading;
  }
  /** @deprecated Use {@link Loading}. */
  public set loading(value: boolean) {
    this.Loading = value;
  }

  constructor() {
        super();}

  async ngOnInit() {
    if (!this.EntityInfo || !this.RunViewParams)
      throw new Error("EntityInfo and RunViewParams are required");

    await this.LoadTemplates();
  }

  async LoadTemplates() {
    // load up all template metadata
    const rv = RunView.FromMetadataProvider(this.ProviderToUse);
    // Dialect-neutral "active now" cutoff: GETDATE() does not exist on PostgreSQL,
    // so inject a JS-computed ISO-8601 literal instead.
    const nowIso = new Date().toISOString();
    const result = await rv.RunView<MJTemplateEntityExtended>(
      {
        EntityName: "MJ: Templates",
        ExtraFilter: `(IsActive = 1 AND (ActiveAt IS NULL OR ActiveAt <= '${nowIso}')) ${this.TemplateFilter ? `AND ${this.TemplateFilter}` : ''}`,
        ResultType: 'entity_object'
      }
    );
    const content = await rv.RunView<MJTemplateContentEntity>({
      EntityName: "MJ: Template Contents",
      ResultType: 'entity_object'
    })
    this.Templates = result.Results;
    this.Templates.forEach(template => {
      template.Content = content.Results.filter(c => UUIDsEqual(c.TemplateID, template.ID));
    });
  }

  /** @deprecated Use {@link LoadTemplates}. */
  async loadTemplates() {
    return this.LoadTemplates();
  }

  SelectTemplate(template: MJTemplateEntityExtended) {
    this.SelectedTemplate = template;
    this.TemplateSelected.emit(template);
    this.Step = 2;
    this.loadMessagePreviews();    
  }

  /** @deprecated Use {@link SelectTemplate}. */
  selectTemplate(template: MJTemplateEntityExtended) {
    return this.SelectTemplate(template);
  }

  protected async loadMessagePreviews() {
    this.Loading = true;

    const msg: Message = new Message();
    msg.From = "amith@bluecypress.io"
    msg.Subject = "Test Subject";

    const sendGrid = CommunicationEngineBase.Instance.Providers.find(p => p.Name === "SendGrid")
    if (!sendGrid)
      throw new Error("SendGrid provider not found");

    const email = sendGrid.MessageTypes.find(mt => mt.Name === "Email");
    if (!email) 
      throw new Error("Email message type not found");

    if (!this.SelectedTemplate)
      throw new Error("No template selected");

    msg.MessageType = email;

    msg.HTMLBodyTemplate =  this.SelectedTemplate;
    msg.SubjectTemplate = TemplateEngineBase.Instance.FindTemplate('Test Subject Template')
    
    const commParams: EntityCommunicationParams = {
      EntityID: this.EntityInfo!.ID, 
      RunViewParams: this.RunViewParams!, 
      ProviderName: "SendGrid", 
      ProviderMessageTypeName: "Email", 
      Message: msg,
      PreviewOnly: true,
      IncludeProcessedMessages: true
    }
    const result = await EntityCommunicationsEngineClient.Instance.RunEntityCommunication(commParams);
    if (result && result.Success && result.Results) {
      this.PreviewMessages = result.Results.map(r => r.Message)
    }

    this.Loading = false;
  }

  CurrentPreviewItemSubject(): string {
    if (this.PreviewMessages && this.PreviewMessages.length > 0) {
      if (this.CurrentMessageIndex >=0 && this.CurrentMessageIndex < this.PreviewMessages.length) {
        return this.PreviewMessages[this.CurrentMessageIndex].ProcessedSubject!;      
      }
    }

    return 'Error processing template content';
  }

  /** @deprecated Use {@link CurrentPreviewItemSubject}. */
  currentPreviewItemSubject(): string {
    return this.CurrentPreviewItemSubject();
  }
  CurrentPreviewItemBody(): string {
    if (this.PreviewMessages && this.PreviewMessages.length > 0) {
      if (this.CurrentMessageIndex >=0 && this.CurrentMessageIndex < this.PreviewMessages.length) {
        return this.PreviewMessages[this.CurrentMessageIndex].ProcessedHTMLBody!;      
      }
    }

    return 'Error processing template content';
  }

  /** @deprecated Use {@link CurrentPreviewItemBody}. */
  currentPreviewItemBody(): string {
    return this.CurrentPreviewItemBody();
  }

  GoBack() {
    this.Step = 1;
  }

  /** @deprecated Use {@link GoBack}. */
  goBack() {
    return this.GoBack();
  }


  FirstMessage() {
    this.CurrentMessageIndex = 0;
  }

  /** @deprecated Use {@link FirstMessage}. */
  firstMessage() {
    return this.FirstMessage();
  }

  LastMessage() {
    this.CurrentMessageIndex = this.PreviewMessages.length - 1;
  }

  /** @deprecated Use {@link LastMessage}. */
  lastMessage() {
    return this.LastMessage();
  }

  NextMessage() {
    if (this.CurrentMessageIndex < this.PreviewMessages.length - 1) {
      this.CurrentMessageIndex++;
    }
  }

  /** @deprecated Use {@link NextMessage}. */
  nextMessage() {
    return this.NextMessage();
  }

  PreviousMessage() {
    if (this.CurrentMessageIndex > 0) {
      this.CurrentMessageIndex--;
    }
  }

  /** @deprecated Use {@link PreviousMessage}. */
  previousMessage() {
    return this.PreviousMessage();
  }
}

 