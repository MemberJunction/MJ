import { Component } from '@angular/core';
import { MJIntegrationURLFormatEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Integration URL Formats') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjintegrationurlformat-form',
    templateUrl: './mjintegrationurlformat.form.component.html'
})
export class MJIntegrationURLFormatFormComponent extends BaseFormComponent {
    public record!: MJIntegrationURLFormatEntity;

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

