import { Component } from '@angular/core';
import { AgentEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Agents') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-agent-form',
    templateUrl: './agent.form.component.html'
})
export class AgentFormComponent extends BaseFormComponent {
    public record!: AgentEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'clients', sectionName: 'Clients', isExpanded: false },
            { sectionKey: 'openHouses', sectionName: 'Open Houses', isExpanded: false },
            { sectionKey: 'showings', sectionName: 'Showings', isExpanded: false },
            { sectionKey: 'transactions', sectionName: 'Transactions', isExpanded: false },
            { sectionKey: 'properties', sectionName: 'Properties', isExpanded: false },
            { sectionKey: 'transactions1', sectionName: 'Transactions', isExpanded: false }
        ]);
    }
}

