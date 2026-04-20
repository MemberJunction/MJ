import { Component } from '@angular/core';
import { AssociationDemoResourceDownloadEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Resource Downloads') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-associationdemoresourcedownload-form',
    templateUrl: './associationdemoresourcedownload.form.component.html'
})
export class AssociationDemoResourceDownloadFormComponent extends BaseFormComponent {
    public record!: AssociationDemoResourceDownloadEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'downloadDetails', sectionName: 'Download Details', isExpanded: true },
            { sectionKey: 'accessLogs', sectionName: 'Access Logs', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

