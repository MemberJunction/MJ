import { Component, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';

interface UDTColumn {
  Name: string;
  Type: string;
  MaxLength: number | null;
  AllowEmpty: boolean;
  DefaultValue: string;
  Description: string;
}

const COLUMN_TYPES = [
  { value: 'string', label: 'Text (String)' },
  { value: 'text', label: 'Long Text' },
  { value: 'integer', label: 'Integer' },
  { value: 'bigint', label: 'Large Integer' },
  { value: 'decimal', label: 'Decimal' },
  { value: 'boolean', label: 'Yes/No (Boolean)' },
  { value: 'datetime', label: 'Date & Time' },
  { value: 'date', label: 'Date' },
  { value: 'uuid', label: 'UUID' },
  { value: 'json', label: 'JSON' },
  { value: 'float', label: 'Float' },
];

@RegisterClass(BaseResourceComponent, 'UDTCreator')
@Component({
  standalone: false,
  selector: 'mj-udt-creator',
  templateUrl: './udt-creator.component.html',
  styleUrls: ['./udt-creator.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UDTCreatorComponent extends BaseResourceComponent {
  private cdr = inject(ChangeDetectorRef);

  TableName = '';
  TableDescription = '';
  Columns: UDTColumn[] = [this.NewColumn()];
  ColumnTypes = COLUMN_TYPES;

  IsCreating = false;
  IsPreviewing = false;
  PreviewSQL: string | null = null;
  PreviewEntityName: string | null = null;
  PreviewTableName: string | null = null;
  ResultMessage: string | null = null;
  ResultSuccess = false;
  ValidationErrors: string[] = [];

  get IsValid(): boolean {
    if (!this.TableName.trim()) return false;
    if (this.Columns.length === 0) return false;
    return this.Columns.every(c => c.Name.trim().length > 0);
  }

  NewColumn(): UDTColumn {
    return { Name: '', Type: 'string', MaxLength: 255, AllowEmpty: true, DefaultValue: '', Description: '' };
  }

  AddColumn(): void {
    this.Columns.push(this.NewColumn());
    this.cdr.markForCheck();
  }

  RemoveColumn(index: number): void {
    if (this.Columns.length > 1) {
      this.Columns.splice(index, 1);
      this.cdr.markForCheck();
    }
  }

  MoveColumnUp(index: number): void {
    if (index > 0) {
      [this.Columns[index], this.Columns[index - 1]] = [this.Columns[index - 1], this.Columns[index]];
      this.cdr.markForCheck();
    }
  }

  MoveColumnDown(index: number): void {
    if (index < this.Columns.length - 1) {
      [this.Columns[index], this.Columns[index + 1]] = [this.Columns[index + 1], this.Columns[index]];
      this.cdr.markForCheck();
    }
  }

  ShowMaxLength(type: string): boolean {
    return type === 'string';
  }

  async PreviewTable(): Promise<void> {
    if (!this.IsValid) return;
    this.IsPreviewing = true;
    this.PreviewSQL = null;
    this.ValidationErrors = [];
    this.cdr.markForCheck();

    try {
      const gql = `mutation PreviewUserDefinedTable($input: CreateUserDefinedTableInput!) {
        PreviewUserDefinedTable(input: $input) { Valid SqlTableName EntityName MigrationSQL ValidationErrors }
      }`;
      const response = await this.ExecuteGraphQL(gql, { input: this.BuildInput() });
      const result = (response as Record<string, Record<string, unknown>>)?.PreviewUserDefinedTable;

      if (result?.Valid) {
        this.PreviewSQL = result.MigrationSQL as string;
        this.PreviewEntityName = result.EntityName as string;
        this.PreviewTableName = result.SqlTableName as string;
      } else {
        this.ValidationErrors = (result?.ValidationErrors as string[]) ?? ['Preview failed'];
      }
    } catch (err: unknown) {
      this.ValidationErrors = [err instanceof Error ? err.message : String(err)];
    } finally {
      this.IsPreviewing = false;
      this.cdr.markForCheck();
    }
  }

  async CreateTable(): Promise<void> {
    if (!this.IsValid) return;
    this.IsCreating = true;
    this.ResultMessage = null;
    this.ResultSuccess = false;
    this.ValidationErrors = [];
    this.cdr.markForCheck();

    try {
      const gql = `mutation CreateUserDefinedTable($input: CreateUserDefinedTableInput!) {
        CreateUserDefinedTable(input: $input) {
          Success BranchName MigrationFilePath APIRestarted GitCommitSuccess ErrorMessage ErrorStep
          Steps { Name Status DurationMs Message }
        }
      }`;
      const response = await this.ExecuteGraphQL(gql, { input: this.BuildInput() });
      const result = (response as Record<string, Record<string, unknown>>)?.CreateUserDefinedTable;

      this.ResultSuccess = (result?.Success as boolean) ?? false;
      if (result?.Success) {
        this.ResultMessage = 'Table created successfully! The entity is now available in MemberJunction.';
      } else {
        this.ResultMessage = (result?.ErrorMessage as string) ?? 'Table creation failed';
        if (result?.ErrorStep) {
          this.ResultMessage += ` (failed at: ${result.ErrorStep})`;
        }
      }
    } catch (err: unknown) {
      this.ResultSuccess = false;
      this.ResultMessage = err instanceof Error ? err.message : String(err);
    } finally {
      this.IsCreating = false;
      this.cdr.markForCheck();
    }
  }

  ResetForm(): void {
    this.TableName = '';
    this.TableDescription = '';
    this.Columns = [this.NewColumn()];
    this.PreviewSQL = null;
    this.PreviewEntityName = null;
    this.PreviewTableName = null;
    this.ResultMessage = null;
    this.ResultSuccess = false;
    this.ValidationErrors = [];
    this.cdr.markForCheck();
  }

  private BuildInput(): Record<string, unknown> {
    return {
      DisplayName: this.TableName.trim(),
      Description: this.TableDescription.trim() || null,
      Columns: this.Columns.map(c => ({
        Name: c.Name.trim(),
        Type: c.Type,
        MaxLength: this.ShowMaxLength(c.Type) ? c.MaxLength : null,
        AllowEmpty: c.AllowEmpty,
      })),
    };
  }

  private async ExecuteGraphQL(query: string, variables: Record<string, unknown>): Promise<unknown> {
    const response = await fetch('/api/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    });
    const json = await response.json() as { data?: unknown; errors?: Array<{ message: string }> };
    if (json.errors?.length) {
      throw new Error(json.errors[0].message);
    }
    return json.data;
  }
}

export function LoadUDTCreator() {
  // tree-shaking prevention
}
