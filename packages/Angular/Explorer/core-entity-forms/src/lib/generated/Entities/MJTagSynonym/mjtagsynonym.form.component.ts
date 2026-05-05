import { Component } from '@angular/core';
import { MJTagSynonymEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Tag Synonyms') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjtagsynonym-form',
    templateUrl: './mjtagsynonym.form.component.html'
})
export class MJTagSynonymFormComponent extends BaseFormComponent {
    public record!: MJTagSynonymEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'tagMapping', sectionName: 'Tag Mapping', isExpanded: true },
            { sectionKey: 'synonymDetails', sectionName: 'Synonym Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

