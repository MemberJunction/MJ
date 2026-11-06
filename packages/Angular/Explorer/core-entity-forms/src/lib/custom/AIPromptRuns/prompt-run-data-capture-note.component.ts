import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import type { TemplateDataCaptureMode, TemplateDataObjectShape, TemplateDataShape } from '@memberjunction/ai-core-plus';

/** A template input that a shape record can describe. */
type TemplateInputName = keyof TemplateDataShape;

/** One row of the key-size table. */
interface DataShapeRow {
    /** The template input that holds the key. */
    Input: TemplateInputName;
    /** The top-level key name. */
    Key: string;
    /** The display text for the size of the key's value. */
    Size: string;
}

/** Table order of the template inputs. */
const TEMPLATE_INPUTS: readonly TemplateInputName[] = ['data', 'templateData'];
const BYTES_PER_KB = 1024;
const BYTES_PER_MB = 1024 * 1024;

/**
 * Tells the user which template data an AI prompt run stored in `Messages`, by capture mode.
 * For a `None` run it also shows the stored key sizes of `data` and `templateData`.
 * It renders nothing for runs saved before capture modes existed.
 */
@Component({
    standalone: false,
    selector: 'mj-prompt-run-data-capture-note',
    templateUrl: './prompt-run-data-capture-note.component.html',
    styleUrls: ['./prompt-run-data-capture-note.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class PromptRunDataCaptureNoteComponent {
    private _dataCapture: TemplateDataCaptureMode | null = null;
    private _dataShape: TemplateDataShape | null = null;
    private _dataCaptureNote: string | null = null;

    /** Template-data capture mode stored with the run; null for runs saved before capture modes existed. */
    @Input()
    set DataCapture(value: TemplateDataCaptureMode | null) {
        this._dataCapture = value;
        this.updateNote();
    }
    get DataCapture(): TemplateDataCaptureMode | null {
        return this._dataCapture;
    }

    /** Key sizes of the template inputs, stored in `None` mode. */
    @Input()
    set DataShape(value: TemplateDataShape | null) {
        this._dataShape = value;
        this.updateNote();
    }
    get DataShape(): TemplateDataShape | null {
        return this._dataShape;
    }

    /** Why a `Referenced` run stored `Full`. */
    @Input()
    set DataCaptureNote(value: string | null) {
        this._dataCaptureNote = value;
        this.updateNote();
    }
    get DataCaptureNote(): string | null {
        return this._dataCaptureNote;
    }

    /** The sentence that tells what the run stored; null when the note shows nothing. */
    public Message: string | null = null;
    /** Key sizes of a `None` run: `data` rows, then `templateData` rows, each largest first. */
    public Rows: DataShapeRow[] = [];
    /** One notice for each input whose shape lists only its largest keys. */
    public ElidedNotices: string[] = [];

    /** Computes `Message`, `Rows` and `ElidedNotices` from the three inputs. */
    private updateNote(): void {
        this.Message = this.buildMessage();
        this.Rows = [];
        this.ElidedNotices = [];
        if (this._dataCapture === 'None') {
            for (const input of TEMPLATE_INPUTS) {
                this.addShape(input, this._dataShape?.[input]);
            }
        }
    }

    private buildMessage(): string | null {
        switch (this._dataCapture) {
            case 'None':
                return 'Template data was not stored for this run (capture: None).';
            case 'Referenced':
                return "Only the template data keys the prompt's templates read were stored (capture: Referenced).";
            case 'Full':
                return this.buildFullMessage();
            default:
                return null;
        }
    }

    private buildFullMessage(): string | null {
        const note = this._dataCaptureNote?.trim();
        return note ? `All template data was stored (capture: Full). ${note}` : null;
    }

    /** Adds the rows of one input and, when keys were left out, its notice. A malformed entry adds nothing. */
    private addShape(input: TemplateInputName, shape: TemplateDataObjectShape | undefined): void {
        if (!hasKeySizes(shape)) {
            return;
        }
        const rows = buildRows(input, shape.keys);
        this.Rows.push(...rows);
        if (shape.keysElided === true) {
            this.ElidedNotices.push(`Showing the ${rows.length} largest of ${shape.keyCount} keys in ${input}.`);
        }
    }
}

/** True when `shape` is an object whose `keys` is a key-size map. Stored JSON is not validated when it is parsed. */
function hasKeySizes(shape: TemplateDataObjectShape | undefined): shape is TemplateDataObjectShape {
    return shape != null
        && typeof shape === 'object'
        && typeof shape.keys === 'object'
        && shape.keys !== null
        && !Array.isArray(shape.keys);
}

/** Rows for one input, largest first. Keys whose size is not a number are left out. */
function buildRows(input: TemplateInputName, keys: Record<string, number>): DataShapeRow[] {
    return Object.entries(keys)
        .filter(([, bytes]) => typeof bytes === 'number')
        .sort(([, a], [, b]) => b - a)
        .map(([key, bytes]) => ({ Input: input, Key: key, Size: formatSize(bytes) }));
}

/** Display text for a byte size; -1 marks a value that could not be serialized. */
function formatSize(bytes: number): string {
    if (bytes === -1) {
        return 'not serializable';
    }
    if (bytes < BYTES_PER_KB) {
        return `${bytes} B`;
    }
    if (bytes < BYTES_PER_MB) {
        return `${(bytes / BYTES_PER_KB).toFixed(1)} KB`;
    }
    return `${(bytes / BYTES_PER_MB).toFixed(1)} MB`;
}
