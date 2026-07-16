import { Component } from '@angular/core';
import { MJMLComponentSlotEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: ML Component Slots') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjmlcomponentslot-form',
    templateUrl: './mjmlcomponentslot.form.component.html'
})
export class MJMLComponentSlotFormComponent extends BaseFormComponent {
    public record!: MJMLComponentSlotEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

