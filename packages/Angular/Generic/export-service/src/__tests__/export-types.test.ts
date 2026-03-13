import { describe, it, expect } from 'vitest';
import type {
  ExportDialogConfig,
  ExportColumnInfo,
  ExportDialogResult,
  ExportServiceOptions
} from '../lib/export.types';

describe('ExportDialogConfig', () => {
  it('should construct with minimal required fields', () => {
    const config: ExportDialogConfig = {
      totalRows: 100
    };
    expect(config.totalRows).toBe(100);
    expect(config.title).toBeUndefined();
    expect(config.columns).toBeUndefined();
  });

  it('should accept all optional fields', () => {
    const config: ExportDialogConfig = {
      title: 'Export Users',
      totalRows: 500,
      columns: [
        { name: 'Name', displayName: 'Full Name', dataType: 'string', selected: true },
        { name: 'Age', displayName: 'Age', dataType: 'number', selected: false }
      ],
      showAdvancedOptions: true,
      fileName: 'users-export'
    };
    expect(config.columns).toHaveLength(2);
    expect(config.showAdvancedOptions).toBe(true);
  });
});

describe('ExportColumnInfo', () => {
  it('should represent a string column', () => {
    const col: ExportColumnInfo = {
      name: 'Email',
      displayName: 'Email Address',
      dataType: 'string',
      selected: true
    };
    expect(col.dataType).toBe('string');
    expect(col.selected).toBe(true);
  });

  it('should support all data types', () => {
    const types: ExportColumnInfo['dataType'][] = ['string', 'number', 'date', 'boolean', 'currency'];
    expect(types).toHaveLength(5);
  });
});

describe('ExportDialogResult', () => {
  it('should represent a cancelled dialog', () => {
    const result: ExportDialogResult = { confirmed: false };
    expect(result.confirmed).toBe(false);
    expect(result.format).toBeUndefined();
  });

  it('should represent a confirmed export', () => {
    const result: ExportDialogResult = {
      confirmed: true,
      format: 'excel',
      includeHeaders: true,
      fileName: 'export-data',
      sampling: { mode: 'all' },
      selectedColumns: ['Name', 'Email']
    };
    expect(result.format).toBe('excel');
    expect(result.selectedColumns).toHaveLength(2);
  });

  it('should support all sampling modes', () => {
    const modes: NonNullable<ExportDialogResult['sampling']>['mode'][] = [
      'all', 'top', 'bottom', 'every-nth', 'random'
    ];
    expect(modes).toHaveLength(5);
  });
});

describe('ExportServiceOptions', () => {
  it('should construct with required fields', () => {
    const options: ExportServiceOptions = {
      data: [{ Name: 'Test', Value: 42 }],
      format: 'csv'
    };
    expect(options.data).toHaveLength(1);
    expect(options.format).toBe('csv');
  });

  it('should support JSON format', () => {
    const options: ExportServiceOptions = {
      data: [],
      format: 'json',
      fileName: 'data',
      includeHeaders: true
    };
    expect(options.format).toBe('json');
  });
});
