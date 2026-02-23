import { Component } from '@angular/core';
import { MJContentSourceTypeParamsEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Content Source Type Params') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjcontentsourcetypeparams-form',
    templateUrl: './mjcontentsourcetypeparams.form.component.html'
})
export class MJContentSourceTypeParamsFormComponent extends BaseFormComponent {
    public record!: MJContentSourceTypeParamsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

