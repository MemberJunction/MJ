import { Component } from '@angular/core';
import { PriorityEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Priorities') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-priority-form',
    templateUrl: './priority.form.component.html'
})
export class PriorityFormComponent extends BaseFormComponent {
    public record!: PriorityEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'tickets', sectionName: 'Tickets', isExpanded: false }
        ]);
    }
}

