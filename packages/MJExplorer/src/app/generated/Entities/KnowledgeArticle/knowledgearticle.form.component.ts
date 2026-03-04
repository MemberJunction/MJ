import { Component } from '@angular/core';
import { KnowledgeArticleEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Knowledge Articles') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-knowledgearticle-form',
    templateUrl: './knowledgearticle.form.component.html'
})
export class KnowledgeArticleFormComponent extends BaseFormComponent {
    public record!: KnowledgeArticleEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

