import { Component } from '@angular/core';
import { SupportAgentEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Support Agents') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-supportagent-form',
    templateUrl: './supportagent.form.component.html'
})
export class SupportAgentFormComponent extends BaseFormComponent {
    public record!: SupportAgentEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'knowledgeArticles', sectionName: 'Knowledge Articles', isExpanded: false },
            { sectionKey: 'tickets', sectionName: 'Tickets', isExpanded: false }
        ]);
    }
}

