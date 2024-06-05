import { Component } from '@angular/core';
import { FileEntityRecordLinkEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadFileEntityRecordLinkDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'File Entity Record Links') // Tell MemberJunction about this class
@Component({
    selector: 'gen-fileentityrecordlink-form',
    templateUrl: './fileentityrecordlink.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class FileEntityRecordLinkFormComponent extends BaseFormComponent {
    public record!: FileEntityRecordLinkEntity;
} 

export function LoadFileEntityRecordLinkFormComponent() {
    LoadFileEntityRecordLinkDetailsComponent();
}
