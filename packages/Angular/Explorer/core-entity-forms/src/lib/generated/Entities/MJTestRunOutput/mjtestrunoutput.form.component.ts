import { Component } from '@angular/core';
import { MJTestRunOutputEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Test Run Outputs') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjtestrunoutput-form',
    templateUrl: './mjtestrunoutput.form.component.html'
})
export class MJTestRunOutputFormComponent extends BaseFormComponent {
    public record!: MJTestRunOutputEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'testContext', sectionName: 'Test Context', isExpanded: true },
            { sectionKey: 'outputInformation', sectionName: 'Output Information', isExpanded: true },
            { sectionKey: 'dataAndMedia', sectionName: 'Data and Media', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

