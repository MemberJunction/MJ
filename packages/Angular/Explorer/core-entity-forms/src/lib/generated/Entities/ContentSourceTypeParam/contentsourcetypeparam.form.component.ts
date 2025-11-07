import { Component } from '@angular/core';
import { ContentSourceTypeParamEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Content Source Type Params') // Tell MemberJunction about this class
@Component({
    selector: 'gen-contentsourcetypeparam-form',
    templateUrl: './contentsourcetypeparam.form.component.html'
})
export class ContentSourceTypeParamFormComponent extends BaseFormComponent {
    public record!: ContentSourceTypeParamEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'parameterSpecification', sectionName: 'Parameter Specification', isExpanded: true },
            { sectionKey: 'parameterSettings', sectionName: 'Parameter Settings', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

export function LoadContentSourceTypeParamFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
