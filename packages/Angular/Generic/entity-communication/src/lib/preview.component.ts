import { Component, Output, EventEmitter, Input, OnInit } from '@angular/core';
import { CommunicationEngineBase, Message, ProcessedMessage } from '@memberjunction/communication-types';
import { EntityInfo, RunView, RunViewParams } from '@memberjunction/core';
import { MJTemplateContentEntity, TemplateEntityExtended } from '@memberjunction/core-entities';
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
export class EntityCommunicationsPreviewComponent implements OnInit  {
  @Input() templateFilter: string | undefined;
  @Input() entityInfo: EntityInfo | undefined;
  @Input() runViewParams: RunViewParams | undefined;
  @Output() templateSelected = new EventEmitter<TemplateEntityExtended>();

  templates: TemplateEntityExtended[] = [];
  selectedTemplate: TemplateEntityExtended | null = null;
  step: number = 1;

  public previewMessages: ProcessedMessage[] = [];
  currentMessageIndex: number = 0;
  public loading: boolean = false;

  constructor() {}

  async ngOnInit() {
    if (!this.entityInfo || !this.runViewParams)
      throw new Error("EntityInfo and RunViewParams are required");

    await this.loadTemplates();
  }

  async loadTemplates() {
    // load up all template metadata
    const rv = new RunView();
    const result = await rv.RunView<TemplateEntityExtended>(
      {
        EntityName: "MJ: Templates",
        ExtraFilter: `(IsActive = 1 AND (ActiveAt IS NULL OR ActiveAt <= GETDATE())) ${this.templateFilter ? `AND ${this.templateFilter}` : ''}`,
        ResultType: 'entity_object'
      }
    );
    const content = await rv.RunView<MJTemplateContentEntity>({
      EntityName: "MJ: Template Contents",
      ResultType: 'entity_object'
    })
    this.templates = result.Results;
    this.templates.forEach(template => {
      template.Content = content.Results.filter(c => c.TemplateID === template.ID);
    });
  }

  selectTemplate(template: TemplateEntityExtended) {
    this.selectedTemplate = template;
    this.templateSelected.emit(template);
    this.step = 2;
    this.loadMessagePreviews();    
  }

  protected async loadMessagePreviews() {
    this.loading = true;

    const msg: Message = new Message();
    msg.From = "amith@bluecypress.io"
    msg.Subject = "Test Subject";

    const sendGrid = CommunicationEngineBase.Instance.Providers.find(p => p.Name === "SendGrid")
    if (!sendGrid)
      throw new Error("SendGrid provider not found");

    const email = sendGrid.MessageTypes.find(mt => mt.Name === "Email");
    if (!email) 
      throw new Error("Email message type not found");

    if (!this.selectedTemplate)
      throw new Error("No template selected");

    msg.MessageType = email;

    msg.HTMLBodyTemplate =  this.selectedTemplate;
    msg.SubjectTemplate = TemplateEngineBase.Instance.FindTemplate('Test Subject Template')
    
    const commParams: EntityCommunicationParams = {
      EntityID: this.entityInfo!.ID, 
      RunViewParams: this.runViewParams!, 
      ProviderName: "SendGrid", 
      ProviderMessageTypeName: "Email", 
      Message: msg,
      PreviewOnly: true,
      IncludeProcessedMessages: true
    }
    const result = await EntityCommunicationsEngineClient.Instance.RunEntityCommunication(commParams);
    if (result && result.Success && result.Results) {
      this.previewMessages = result.Results.map(r => r.Message)
    }

    this.loading = false;
  }

  currentPreviewItemSubject(): string {
    if (this.previewMessages && this.previewMessages.length > 0) {
      if (this.currentMessageIndex >=0 && this.currentMessageIndex < this.previewMessages.length) {
        return this.previewMessages[this.currentMessageIndex].ProcessedSubject!;      
      }
    }

    return 'Error processing template content';
  }
  currentPreviewItemBody(): string {
    if (this.previewMessages && this.previewMessages.length > 0) {
      if (this.currentMessageIndex >=0 && this.currentMessageIndex < this.previewMessages.length) {
        return this.previewMessages[this.currentMessageIndex].ProcessedHTMLBody!;      
      }
    }

    return 'Error processing template content';
  }

  goBack() {
    this.step = 1;
  }


  firstMessage() {
    this.currentMessageIndex = 0;
  }

  lastMessage() {
    this.currentMessageIndex = this.previewMessages.length - 1;
  }

  nextMessage() {
    if (this.currentMessageIndex < this.previewMessages.length - 1) {
      this.currentMessageIndex++;
    }
  }

  previousMessage() {
    if (this.currentMessageIndex > 0) {
      this.currentMessageIndex--;
    }
  }
}

 