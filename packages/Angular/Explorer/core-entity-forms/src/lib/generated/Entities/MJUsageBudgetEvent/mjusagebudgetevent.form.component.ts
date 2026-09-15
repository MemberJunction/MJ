import { Component } from '@angular/core';
import { MJUsageBudgetEventEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Usage Budget Events') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjusagebudgetevent-form',
    templateUrl: './mjusagebudgetevent.form.component.html'
})
export class MJUsageBudgetEventFormComponent extends BaseFormComponent {
    public record!: MJUsageBudgetEventEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

