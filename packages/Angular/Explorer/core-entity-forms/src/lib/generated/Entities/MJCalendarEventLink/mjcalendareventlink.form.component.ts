import { Component } from '@angular/core';
import { MJCalendarEventLinkEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Calendar Event Links') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjcalendareventlink-form',
    templateUrl: './mjcalendareventlink.form.component.html'
})
export class MJCalendarEventLinkFormComponent extends BaseFormComponent {
    public record!: MJCalendarEventLinkEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

