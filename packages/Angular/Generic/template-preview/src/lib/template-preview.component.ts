import { Component, Output, EventEmitter, Input, OnInit } from '@angular/core';
import { Metadata, RunView } from '@memberjunction/core';
import { TemplateContentEntity } from '@memberjunction/core-entities';
import { TemplateEngineBase, TemplateEntityExtended } from '@memberjunction/templates-base-types';
 
@Component({
  selector: 'mj-template-preview',
  templateUrl: './template-preview.component.html',
  styleUrls: ['./template-preview.component.css']
})
export class TemplatePreviewComponent implements OnInit  {
  @Input() templateFilter: string | undefined;
  @Output() templateSelected = new EventEmitter<TemplateEntityExtended>();

  templates: TemplateEntityExtended[] = [];
  selectedTemplate: TemplateEntityExtended | null = null;
  step: number = 1;

  constructor() {}

  async ngOnInit() {
    await this.loadTemplates();
  }

  async loadTemplates() {
    // load up all template metadata
    const rv = new RunView();
    const result = await rv.RunView<TemplateEntityExtended>(
      {
        EntityName: "Templates",
        ExtraFilter: `(IsActive = 1 AND (ActiveAt IS NULL OR ActiveAt <= GETDATE())) ${this.templateFilter ? `AND ${this.templateFilter}` : ''}`,
        ResultType: 'entity_object'
      }
    );
    const content = await rv.RunView<TemplateContentEntity>({
      EntityName: "Template Contents",
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
  }

  getSelectedTemplateContent(): string {
    if (this.selectedTemplate) {
      const highestPriority = this.selectedTemplate.GetHighestPriorityContent();
      if (highestPriority && highestPriority.TemplateText) 
        return highestPriority.TemplateText;
    }
    return '';
  }

  goBack() {
    this.step = 1;
  }
}

 