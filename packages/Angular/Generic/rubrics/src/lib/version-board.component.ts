import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';

/** One version as the rubric form shows it, without opening the version record. */
export interface RubricVersionCard {
    id: string;
    status: string;
    label: string;
    bump: string;
    threshold: string;
    criteria: number;
    gates: number;
    bands: string;
    summary: string;
}

/** The versions a person can judge from the rubric, before they open a row. */
@Component({
    standalone: true,
    selector: 'mj-rubric-version-board',
    imports: [CommonModule, MJButtonDirective],
    templateUrl: './version-board.component.html',
    styleUrls: ['./rubric-builder.component.css'],
})
export class RubricVersionBoardComponent {
    @Input() Cards: RubricVersionCard[] = [];
    @Output() Open = new EventEmitter<string>();
}
