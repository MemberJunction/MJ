import { Component } from '@angular/core';
import { MJCalendarSyncStateEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Calendar Sync States') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjcalendarsyncstate-form',
    templateUrl: './mjcalendarsyncstate.form.component.html'
})
export class MJCalendarSyncStateFormComponent extends BaseFormComponent {
    public record!: MJCalendarSyncStateEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

