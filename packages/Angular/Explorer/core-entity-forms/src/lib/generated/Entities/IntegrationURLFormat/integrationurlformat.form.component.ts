import { Component } from '@angular/core';
import { IntegrationURLFormatEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Integration URL Formats') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-integrationurlformat-form',
    templateUrl: './integrationurlformat.form.component.html'
})
export class IntegrationURLFormatFormComponent extends BaseFormComponent {
    public record!: IntegrationURLFormatEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'integrationMetadata', sectionName: 'Integration Metadata', isExpanded: false },
            { sectionKey: 'uRLTemplateConfiguration', sectionName: 'URL Template Configuration', isExpanded: true },
            { sectionKey: 'auditNotes', sectionName: 'Audit & Notes', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

export function LoadIntegrationURLFormatFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
