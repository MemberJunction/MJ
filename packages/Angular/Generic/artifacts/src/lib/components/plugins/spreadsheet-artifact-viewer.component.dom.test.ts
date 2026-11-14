import { describe, it, expect, vi, afterEach } from 'vitest';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TestBed } from '@angular/core/testing';
import type { IMetadataProvider } from '@memberjunction/core';
import { MJArtifactVersionEntity, SpreadsheetEngine } from '@memberjunction/core-entities';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { renderComponentFixture, query, capture } from '@memberjunction/ng-test-utils';
import { SpreadsheetArtifactViewerComponent } from './spreadsheet-artifact-viewer.component';

@Component({
  standalone: true,
  selector: 'mj-artifact-type-plugin-viewer',
  template: '<div data-testid="sheet-plugin-viewer-stub"></div>',
})
class SheetPluginViewerStubComponent {
  @Input() Provider: IMetadataProvider | null = null;
  @Input() artifactVersion: unknown;
  @Input() artifactTypeName = '';
  @Input() ArtifactTypeName = '';
  @Input() readonly = true;
  @Output() ContentCommitted = new EventEmitter<string>();
}

@Component({
  standalone: true,
  selector: 'mj-xlsx-preview',
  template: '<div data-testid="xlsx-preview-stub"></div>',
})
class XlsxPreviewStubComponent {
  @Input() ArrayBuffer: ArrayBuffer | null = null;
}

afterEach(() => {
  vi.restoreAllMocks();
  TestBed.resetTestingModule();
});

function makeSheetVersion(): MJArtifactVersionEntity {
  const wb = SpreadsheetEngine.Instance.CreateEmptyWorkbook('Revenue Forecast');
  SpreadsheetEngine.Instance.SetCell(wb, wb.Worksheets[0].SheetID, 'A1', { Value: 500 });
  const ver = Object.create(MJArtifactVersionEntity.prototype) as MJArtifactVersionEntity;
  Object.defineProperties(ver, {
    ID: { value: 'shv-dom-1', enumerable: true },
    ArtifactID: { value: 'art-sheet-dom-1', enumerable: true },
    Name: { value: 'Revenue Forecast', enumerable: true },
    VersionNumber: { value: 1, enumerable: true },
    ContentMode: { value: 'Text', enumerable: true },
    Configuration: { value: null, enumerable: true },
    Content: { value: SpreadsheetEngine.Instance.SerializeWorkbook(wb), enumerable: true },
  });
  return ver;
}

describe('SpreadsheetArtifactViewerComponent DOM', () => {
  it('mounts read-only by default (B3) and renders the spreadsheet shell', () => {
    const f = renderComponentFixture(SpreadsheetArtifactViewerComponent, {
      imports: [FormsModule, SheetPluginViewerStubComponent, XlsxPreviewStubComponent],
      declarations: [SpreadsheetArtifactViewerComponent],
      providers: [{ provide: MJNotificationService, useValue: { CreateSimpleNotification: vi.fn() } }],
      inputs: {
        artifactVersion: makeSheetVersion(),
        readonly: true,
      },
    });
    f.detectChanges();
    expect(f.componentInstance.CanEdit).toBe(false);
    expect(query(f, '.mj-sheets-shell')).not.toBeNull();
  });

  it('resolves ActiveCellAddress from ActiveRowIndex and ActiveColumnIndex', () => {
    const f = renderComponentFixture(SpreadsheetArtifactViewerComponent, {
      imports: [FormsModule, SheetPluginViewerStubComponent, XlsxPreviewStubComponent],
      declarations: [SpreadsheetArtifactViewerComponent],
      providers: [{ provide: MJNotificationService, useValue: { CreateSimpleNotification: vi.fn() } }],
      inputs: {
        artifactVersion: makeSheetVersion(),
        readonly: true,
      },
      setup: (inst) => {
        inst.ActiveRowIndex = 2;
        inst.ActiveColumnIndex = 3;
      },
    });
    f.detectChanges();
    expect(f.componentInstance.ActiveCellAddress).toBe('C2');
  });

  it('wires ContentCommitted output on base viewer contract', () => {
    const f = renderComponentFixture(SpreadsheetArtifactViewerComponent, {
      imports: [FormsModule, SheetPluginViewerStubComponent, XlsxPreviewStubComponent],
      declarations: [SpreadsheetArtifactViewerComponent],
      providers: [{ provide: MJNotificationService, useValue: { CreateSimpleNotification: vi.fn() } }],
      inputs: {
        artifactVersion: makeSheetVersion(),
        readonly: true,
      },
    });
    f.detectChanges();
    const committed = capture(f.componentInstance.ContentCommitted);
    f.componentInstance.ContentCommitted.emit('{}');
    expect(committed).toEqual(['{}']);
  });
});
