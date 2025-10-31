import { Component } from '@angular/core';
import { TopicCodeLinkEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadTopicCodeLinkDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Topic Code Links') // Tell MemberJunction about this class
@Component({
    selector: 'gen-topiccodelink-form',
    templateUrl: './topiccodelink.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class TopicCodeLinkFormComponent extends BaseFormComponent {
    public record!: TopicCodeLinkEntity;
} 

export function LoadTopicCodeLinkFormComponent() {
    LoadTopicCodeLinkDetailsComponent();
}
