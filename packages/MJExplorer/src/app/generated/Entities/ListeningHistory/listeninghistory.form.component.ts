import { Component } from '@angular/core';
import { ListeningHistoryEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Listening Histories') // Tell MemberJunction about this class
@Component({
    selector: 'gen-listeninghistory-form',
    templateUrl: './listeninghistory.form.component.html'
})
export class ListeningHistoryFormComponent extends BaseFormComponent {
    public record!: ListeningHistoryEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

export function LoadListeningHistoryFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
