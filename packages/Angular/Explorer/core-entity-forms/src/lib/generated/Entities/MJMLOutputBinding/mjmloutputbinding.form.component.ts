import { Component } from '@angular/core';
import { MJMLOutputBindingEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: ML Output Bindings') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjmloutputbinding-form',
    templateUrl: './mjmloutputbinding.form.component.html'
})
export class MJMLOutputBindingFormComponent extends BaseFormComponent {
    public record!: MJMLOutputBindingEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'outputConfiguration', sectionName: 'Output Configuration', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

