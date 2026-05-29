import { Component } from '@angular/core';
import { MJTemplateParamEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Template Params') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjtemplateparam-form',
    templateUrl: './mjtemplateparam.form.component.html'
})
export class MJTemplateParamFormComponent extends BaseFormComponent {
    public record!: MJTemplateParamEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'templateAssociation', sectionName: 'Template Association', isExpanded: true },
            { sectionKey: 'parameterSpecification', sectionName: 'Parameter Specification', isExpanded: true },
            { sectionKey: 'dynamicLinkingFilters', sectionName: 'Dynamic Linking & Filters', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

