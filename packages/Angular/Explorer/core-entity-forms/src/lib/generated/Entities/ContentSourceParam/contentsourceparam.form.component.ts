import { Component } from '@angular/core';
import { ContentSourceParamEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Content Source Params') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-contentsourceparam-form',
    templateUrl: './contentsourceparam.form.component.html'
})
export class ContentSourceParamFormComponent extends BaseFormComponent {
    public record!: ContentSourceParamEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'parameterSettings', sectionName: 'Parameter Settings', isExpanded: true }
        ]);
    }
}

