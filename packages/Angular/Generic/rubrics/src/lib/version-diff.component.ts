import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { RubricVersionSnapshot } from '@memberjunction/rubrics-base';
import { versionRows, type DiffRow } from './model.js';

/** Base on the left, draft on the right, one row per criterion key. */
@Component({
    standalone: true,
    selector: 'mj-rubric-version-diff',
    imports: [CommonModule],
    templateUrl: './version-diff.component.html',
    styleUrls: ['./rubric-builder.component.css'],
})
export class RubricVersionDiffComponent {
    @Input() Base: RubricVersionSnapshot | null = null;
    @Input() Draft: RubricVersionSnapshot | null = null;

    public get Rows(): DiffRow[] {
        return this.Base && this.Draft ? versionRows(this.Base, this.Draft) : [];
    }
}
