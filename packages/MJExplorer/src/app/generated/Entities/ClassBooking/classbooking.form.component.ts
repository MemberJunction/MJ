import { Component } from '@angular/core';
import { ClassBookingEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Class Bookings') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-classbooking-form',
    templateUrl: './classbooking.form.component.html'
})
export class ClassBookingFormComponent extends BaseFormComponent {
    public record!: ClassBookingEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

