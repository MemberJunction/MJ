import { Component } from '@angular/core';
import { demoActivityEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Activities') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-demoactivity-form',
    templateUrl: './demoactivity.form.component.html'
})
export class demoActivityFormComponent extends BaseFormComponent {
    public record!: demoActivityEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'activityDetails', sectionName: 'Activity Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

