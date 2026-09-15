import { Component } from '@angular/core';
import { MJUsageBudgetEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Usage Budgets') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjusagebudget-form',
    templateUrl: './mjusagebudget.form.component.html'
})
export class MJUsageBudgetFormComponent extends BaseFormComponent {
    public record!: MJUsageBudgetEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'mJUsageBudgetEvents', sectionName: 'Usage Budget Events', isExpanded: false }
        ]);
    }
}

