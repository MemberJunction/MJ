import { Component } from '@angular/core';
import { ReplyEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadReplyDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Replies') // Tell MemberJunction about this class
@Component({
    selector: 'gen-reply-form',
    templateUrl: './reply.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ReplyFormComponent extends BaseFormComponent {
    public record!: ReplyEntity;
} 

export function LoadReplyFormComponent() {
    LoadReplyDetailsComponent();
}
