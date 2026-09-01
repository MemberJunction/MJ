import { Component } from '@angular/core';
import { MJMLComponentTypeSlotEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: ML Component Type Slots') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjmlcomponenttypeslot-form',
    templateUrl: './mjmlcomponenttypeslot.form.component.html'
})
export class MJMLComponentTypeSlotFormComponent extends BaseFormComponent {
    public record!: MJMLComponentTypeSlotEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

