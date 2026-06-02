import { Component } from '@angular/core';
import { MJContentSourceTypeParamEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Content Source Type Params') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjcontentsourcetypeparam-form',
    templateUrl: './mjcontentsourcetypeparam.form.component.html'
})
export class MJContentSourceTypeParamFormComponent extends BaseFormComponent {
    public record!: MJContentSourceTypeParamEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

