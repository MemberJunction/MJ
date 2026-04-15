import { Component } from '@angular/core';
import { MJContentSourceParamEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Content Source Params') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjcontentsourceparam-form',
    templateUrl: './mjcontentsourceparam.form.component.html'
})
export class MJContentSourceParamFormComponent extends BaseFormComponent {
    public record!: MJContentSourceParamEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'parameterSettings', sectionName: 'Parameter Settings', isExpanded: true }
        ]);
    }
}

