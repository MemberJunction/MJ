import { Component } from '@angular/core';
import { MJMLComponentBindingEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: ML Component Bindings') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjmlcomponentbinding-form',
    templateUrl: './mjmlcomponentbinding.form.component.html'
})
export class MJMLComponentBindingFormComponent extends BaseFormComponent {
    public record!: MJMLComponentBindingEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

