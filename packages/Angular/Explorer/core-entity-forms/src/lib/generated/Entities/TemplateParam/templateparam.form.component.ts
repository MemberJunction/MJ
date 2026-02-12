import { Component } from '@angular/core';
import { TemplateParamEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Template Params') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-templateparam-form',
    templateUrl: './templateparam.form.component.html'
})
export class TemplateParamFormComponent extends BaseFormComponent {
    public record!: TemplateParamEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'templateAssociation', sectionName: 'Template Association', isExpanded: true },
            { sectionKey: 'parameterSpecification', sectionName: 'Parameter Specification', isExpanded: true },
            { sectionKey: 'dynamicLinkingFilters', sectionName: 'Dynamic Linking & Filters', isExpanded: false },
            { sectionKey: 'templateContent', sectionName: 'Template Content', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

