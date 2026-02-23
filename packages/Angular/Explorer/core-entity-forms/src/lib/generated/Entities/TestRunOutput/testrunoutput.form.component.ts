import { Component } from '@angular/core';
import { TestRunOutputEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Test Run Outputs') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-testrunoutput-form',
    templateUrl: './testrunoutput.form.component.html'
})
export class TestRunOutputFormComponent extends BaseFormComponent {
    public record!: TestRunOutputEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'generalInformation', sectionName: 'General Information', isExpanded: true },
            { sectionKey: 'contentData', sectionName: 'Content & Data', isExpanded: true },
            { sectionKey: 'mediaMetadata', sectionName: 'Media Metadata', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

