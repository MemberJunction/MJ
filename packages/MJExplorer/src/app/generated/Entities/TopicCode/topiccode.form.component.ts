import { Component } from '@angular/core';
import { TopicCodeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadTopicCodeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Topic Codes') // Tell MemberJunction about this class
@Component({
    selector: 'gen-topiccode-form',
    templateUrl: './topiccode.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class TopicCodeFormComponent extends BaseFormComponent {
    public record!: TopicCodeEntity;
} 

export function LoadTopicCodeFormComponent() {
    LoadTopicCodeDetailsComponent();
}
