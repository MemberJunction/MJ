import { Component } from '@angular/core';
import { MJContentSourceParamsEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Content Source Params') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjcontentsourceparams-form',
    templateUrl: './mjcontentsourceparams.form.component.html'
})
export class MJContentSourceParamsFormComponent extends BaseFormComponent {
    public record!: MJContentSourceParamsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'parameterSettings', sectionName: 'Parameter Settings', isExpanded: true }
        ]);
    }
}

