import { Component } from '@angular/core';
import { ContentSourceTypeParamEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Content Source Type Params') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-contentsourcetypeparam-form',
    templateUrl: './contentsourcetypeparam.form.component.html'
})
export class ContentSourceTypeParamFormComponent extends BaseFormComponent {
    public record!: ContentSourceTypeParamEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

