import { Component, ChangeDetectorRef, EventEmitter, Output, inject } from '@angular/core';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';

/** Logical column type choices presented to the user. */
export type UDTColumnType =
    | 'string' | 'text' | 'integer' | 'bigint' | 'float'
    | 'decimal' | 'boolean' | 'datetime' | 'date';

/** A column row in the UI column list. */
export interface UDTColumnRow {
    Name: string;
    Type: UDTColumnType;
    AllowEmpty: boolean;
    MaxLength: number | null;
    Description: string;
}

/** Result emitted after the table is successfully created. */
export interface UDTCreatedEvent {
    TableName: string;
    EntityName: string;
}

/** One step in the RSU pipeline result. */
interface PipelineStep {
    Name: string;
    Status: string;
    DurationMs: number;
    Message: string;
}

/** Preview result returned by the server. */
interface UDTPreviewResult {
    WouldExecute: boolean;
    TableName: string;
    EntityName: string;
    MigrationSQL: string;
    ValidationErrors: string[];
}

/** Pipeline result returned by the server. */
interface RSUPipelineResult {
    Success: boolean;
    BranchName?: string;
    APIRestarted: boolean;
    GitCommitSuccess: boolean;
    Steps: PipelineStep[];
    ErrorMessage?: string;
    ErrorStep?: string;
}

/**
 * User Defined Table Creator — lets admins define a new first-class MJ entity table
 * directly in the UI. Calls the RSU pipeline to execute the DDL, CodeGen, and MJAPI restart.
 *
 * Usage: <mj-user-defined-table-creator (TableCreated)="onCreated($event)" (Cancelled)="onCancel()">
 */
@Component({
    standalone: false,
    selector: 'mj-user-defined-table-creator',
    templateUrl: './user-defined-table-creator.component.html',
    styleUrls: ['./user-defined-table-creator.component.css'],
})
export class UserDefinedTableCreatorComponent {
    private cdr = inject(ChangeDetectorRef);

    @Output() TableCreated = new EventEmitter<UDTCreatedEvent>();
    @Output() Cancelled = new EventEmitter<void>();

    // ── Form state ──────────────────────────────────────────────────
    public DisplayName = '';
    public Description = '';
    public Columns: UDTColumnRow[] = [this.newColumn()];
    public SkipGitCommit = false;
    public SkipRestart = false;

    // ── Available types ─────────────────────────────────────────────
    public readonly ColumnTypes: { label: string; value: UDTColumnType }[] = [
        { label: 'String (short text)',  value: 'string'   },
        { label: 'Text (long text)',     value: 'text'     },
        { label: 'Integer',              value: 'integer'  },
        { label: 'Big Integer',          value: 'bigint'   },
        { label: 'Float',                value: 'float'    },
        { label: 'Decimal',              value: 'decimal'  },
        { label: 'Boolean (yes/no)',     value: 'boolean'  },
        { label: 'Date & Time',          value: 'datetime' },
        { label: 'Date only',            value: 'date'     },
    ];

    // ── Preview state ────────────────────────────────────────────────
    public IsPreviewing = false;
    public PreviewResult: UDTPreviewResult | null = null;
    public PreviewError = '';

    // ── Create state ─────────────────────────────────────────────────
    public IsCreating = false;
    public PipelineResult: RSUPipelineResult | null = null;
    public CreateError = '';

    // ── Helpers ──────────────────────────────────────────────────────
    public get CanPreview(): boolean {
        return this.DisplayName.trim().length > 0 && this.Columns.length > 0
            && this.Columns.every(c => c.Name.trim().length > 0);
    }

    public get CanCreate(): boolean {
        return this.PreviewResult !== null && this.PreviewResult.WouldExecute && !this.IsCreating;
    }

    public AddColumn(): void {
        this.Columns = [...this.Columns, this.newColumn()];
    }

    public RemoveColumn(index: number): void {
        this.Columns = this.Columns.filter((_, i) => i !== index);
        this.PreviewResult = null;
    }

    public TrackByIndex(index: number): number {
        return index;
    }

    public OnColumnChanged(): void {
        // Reset preview when user edits columns
        this.PreviewResult = null;
        this.PipelineResult = null;
    }

    public Cancel(): void {
        this.Cancelled.emit();
    }

    // ── Preview ──────────────────────────────────────────────────────
    public async Preview(): Promise<void> {
        if (!this.CanPreview) return;

        this.IsPreviewing = true;
        this.PreviewResult = null;
        this.PreviewError = '';
        this.PipelineResult = null;
        this.cdr.detectChanges();

        try {
            const mutation = `
                mutation PreviewUserDefinedTable($input: CreateUserDefinedTableInputGQL!) {
                    PreviewUserDefinedTable(input: $input) {
                        WouldExecute
                        TableName
                        EntityName
                        MigrationSQL
                        ValidationErrors
                    }
                }
            `;
            const result = await GraphQLDataProvider.Instance.ExecuteGQL(mutation, {
                input: this.buildInput(),
            });
            this.PreviewResult = result?.PreviewUserDefinedTable ?? null;
            if (!this.PreviewResult) {
                this.PreviewError = 'No response from server.';
            }
        } catch (err) {
            this.PreviewError = err instanceof Error ? err.message : String(err);
        } finally {
            this.IsPreviewing = false;
            this.cdr.detectChanges();
        }
    }

    // ── Create ───────────────────────────────────────────────────────
    public async CreateTable(): Promise<void> {
        if (!this.CanCreate) return;

        this.IsCreating = true;
        this.PipelineResult = null;
        this.CreateError = '';
        this.cdr.detectChanges();

        try {
            const mutation = `
                mutation CreateUserDefinedTable($input: CreateUserDefinedTableInputGQL!) {
                    CreateUserDefinedTable(input: $input) {
                        Success
                        BranchName
                        APIRestarted
                        GitCommitSuccess
                        Steps { Name Status DurationMs Message }
                        ErrorMessage
                        ErrorStep
                    }
                }
            `;
            const result = await GraphQLDataProvider.Instance.ExecuteGQL(mutation, {
                input: this.buildInput(),
            });
            this.PipelineResult = result?.CreateUserDefinedTable ?? null;
            if (this.PipelineResult?.Success && this.PreviewResult) {
                this.TableCreated.emit({
                    TableName: this.PreviewResult.TableName,
                    EntityName: this.PreviewResult.EntityName,
                });
            } else if (!this.PipelineResult) {
                this.CreateError = 'No response from server.';
            }
        } catch (err) {
            this.CreateError = err instanceof Error ? err.message : String(err);
        } finally {
            this.IsCreating = false;
            this.cdr.detectChanges();
        }
    }

    // ── Private helpers ───────────────────────────────────────────────
    private newColumn(): UDTColumnRow {
        return { Name: '', Type: 'string', AllowEmpty: true, MaxLength: null, Description: '' };
    }

    private buildInput() {
        return {
            DisplayName: this.DisplayName.trim(),
            Description: this.Description.trim() || undefined,
            SkipGitCommit: this.SkipGitCommit || undefined,
            SkipRestart: this.SkipRestart || undefined,
            Columns: this.Columns.map(c => ({
                Name: c.Name.trim(),
                Type: c.Type,
                AllowEmpty: c.AllowEmpty,
                MaxLength: c.MaxLength ?? undefined,
                Description: c.Description.trim() || undefined,
            })),
        };
    }
}
