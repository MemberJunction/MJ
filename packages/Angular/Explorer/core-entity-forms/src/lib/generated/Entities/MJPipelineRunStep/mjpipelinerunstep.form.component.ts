import { Component } from '@angular/core';
import { MJPipelineRunStepEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Pipeline Run Steps') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjpipelinerunstep-form',
    templateUrl: './mjpipelinerunstep.form.component.html'
})
export class MJPipelineRunStepFormComponent extends BaseFormComponent {
    public record!: MJPipelineRunStepEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

