/**
 * @fileoverview Classify · No-Content-Types warning dialog.
 *
 * Presentational warning overlay shown when the user tries to create a content
 * source before any content type exists. Rendered by the HOST, which owns the
 * `Show` state and the cross-tab navigation logic. Intents bubble UP via
 * `(GoToTypes)` (close form + switch to the Types tab) and `(Dismissed)`.
 */
import { Component, Input, Output, EventEmitter } from '@angular/core';

@Component({
    standalone: false,
    selector: 'classify-no-content-type-warning',
    templateUrl: './no-content-type-warning.dialog.component.html',
    styleUrls: ['./no-content-type-warning.dialog.component.css']
})
export class ClassifyNoContentTypeWarningComponent {
    /** Whether the warning overlay is visible. */
    @Input() Show = false;

    /** Emitted when the user chooses to go to the Content Types tab. */
    @Output() GoToTypes = new EventEmitter<void>();
    /** Emitted when the user dismisses the warning. */
    @Output() Dismissed = new EventEmitter<void>();
}
