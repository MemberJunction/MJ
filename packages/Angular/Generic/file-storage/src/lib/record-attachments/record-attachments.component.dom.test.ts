import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ComponentFixture } from '@angular/core/testing';
import { renderComponentFixture, query, queryAll } from '@memberjunction/ng-test-utils';
import {
  MJButtonDirective,
  MJDialogComponent,
  MJDialogActionsComponent,
  MJEmptyStateComponent,
  MJAlertComponent,
  MjSlidePanelComponent,
} from '@memberjunction/ng-ui-components';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { RecordAttachmentsComponent } from './record-attachments.component';
import { RecordAttachmentItem } from './record-attachments.types';
import {
  BeforeDeleteAttachmentEventArgs,
  BeforeUnlinkAttachmentEventArgs,
  BeforePreviewAttachmentEventArgs,
  BeforeUploadAttachmentEventArgs,
} from './record-attachments.events';

const MOD = {
  imports: [
    CommonModule,
    FormsModule,
    MJButtonDirective,
    MJDialogComponent,
    MJDialogActionsComponent,
    MJEmptyStateComponent,
    MJAlertComponent,
    MjSlidePanelComponent,
    SharedGenericModule,
  ],
  declarations: [RecordAttachmentsComponent],
};

const MOCK_ATTACHMENTS: RecordAttachmentItem[] = [
  {
    LinkID: 'link-1',
    FileID: 'file-1',
    Name: 'Quarterly_Report_2026.pdf',
    ContentType: 'application/pdf',
    FileSize: 4404019, // ~4.2 MB
    ProviderName: 'Azure Blob Storage',
    ProviderID: 'prov-azure',
    Status: 'Uploaded',
    CategoryName: 'Reports',
  },
  {
    LinkID: 'link-2',
    FileID: 'file-2',
    Name: 'Site_Blueprint.png',
    ContentType: 'image/png',
    FileSize: 8493465, // ~8.1 MB
    ProviderName: 'AWS S3',
    ProviderID: 'prov-s3',
    Status: 'Uploaded',
    CategoryName: 'Blueprints',
  },
  {
    LinkID: 'link-3',
    FileID: 'file-3',
    Name: 'Agreement.docx',
    ContentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    FileSize: 1363148, // ~1.3 MB
    ProviderName: 'Azure Blob Storage',
    ProviderID: 'prov-azure',
    Status: 'Uploaded',
  },
];

describe('RecordAttachmentsComponent (DOM & Verbs)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the attachments count badge and upload zone when storage accounts are configured', () => {
    const f = renderComponentFixture(RecordAttachmentsComponent, {
      ...MOD,
      inputs: {
        Attachments: [...MOCK_ATTACHMENTS],
        Visible: true,
      },
      setup: (c) => {
        c.StorageAccounts = [
          {
            account: { ID: 'sa-1', Name: 'Primary Blob' } as never,
            provider: { ID: 'prov-1', Name: 'Azure Blob Storage', IsActive: true } as never,
          },
        ];
      },
    });

    const badge = query(f, '.mj-record-attachments-badge');
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toContain('3 attachments');
    expect(query(f, '.mj-upload-dropzone')).not.toBeNull();
  });

  it('hides upload zone and shows warning alert when zero storage accounts are configured', () => {
    const f = renderComponentFixture(RecordAttachmentsComponent, {
      ...MOD,
      inputs: {
        Attachments: [...MOCK_ATTACHMENTS],
        Visible: true,
      },
      setup: (c) => {
        c.StorageAccounts = [];
      },
    });

    expect(query(f, '.mj-upload-dropzone')).toBeNull();
    expect(query(f, 'mj-alert')).not.toBeNull();
  });

  it('renders all attachment cards in grid mode by default', () => {
    const f = renderComponentFixture(RecordAttachmentsComponent, {
      ...MOD,
      inputs: {
        Attachments: [...MOCK_ATTACHMENTS],
        Visible: true,
        ViewMode: 'grid',
      },
    });

    const cards = queryAll(f, '.mj-attachment-card');
    expect(cards.length).toBe(3);
    expect(cards[0].textContent).toContain('Quarterly_Report_2026.pdf');
    expect(cards[1].textContent).toContain('Site_Blueprint.png');
    expect(cards[2].textContent).toContain('Agreement.docx');
  });

  it('switches view mode when SetViewMode is called and emits ViewModeChanged', () => {
    const f = renderComponentFixture(RecordAttachmentsComponent, {
      ...MOD,
      inputs: {
        Attachments: [...MOCK_ATTACHMENTS],
        Visible: true,
        ViewMode: 'grid',
      },
    });

    const spy = vi.spyOn(f.componentInstance.ViewModeChanged, 'emit');
    f.componentInstance.SetViewMode('list');

    expect(f.componentInstance.ViewMode).toBe('list');
    expect(spy).toHaveBeenCalledWith('list');
  });

  it('filters attachments by search term', () => {
    const f = renderComponentFixture(RecordAttachmentsComponent, {
      ...MOD,
      inputs: {
        Attachments: [...MOCK_ATTACHMENTS],
        Visible: true,
      },
    });

    f.componentInstance.SearchTerm = 'blueprint';
    const filtered = f.componentInstance.FilteredAttachments;

    expect(filtered.length).toBe(1);
    expect(filtered[0].Name).toBe('Site_Blueprint.png');
  });

  it('filters attachments by provider', () => {
    const f = renderComponentFixture(RecordAttachmentsComponent, {
      ...MOD,
      inputs: {
        Attachments: [...MOCK_ATTACHMENTS],
        Visible: true,
      },
    });

    f.componentInstance.SelectedProviderFilter = 'prov-azure';
    const filtered = f.componentInstance.FilteredAttachments;

    expect(filtered.length).toBe(2);
    expect(filtered.every((item) => item.ProviderID === 'prov-azure')).toBe(true);
  });

  it('correctly classifies media types', () => {
    const f = renderComponentFixture(RecordAttachmentsComponent, {
      ...MOD,
    });
    const c = f.componentInstance;

    expect(c.GetMediaType(MOCK_ATTACHMENTS[0])).toBe('pdf');
    expect(c.GetMediaType(MOCK_ATTACHMENTS[1])).toBe('image');
    expect(c.GetMediaType(MOCK_ATTACHMENTS[2])).toBe('document');
    expect(c.FormatSize(1024 * 1024 * 5)).toBe('5 MB');
  });

  it('honors BeforeUnlink cancellation', async () => {
    const f = renderComponentFixture(RecordAttachmentsComponent, {
      ...MOD,
      inputs: {
        Attachments: [...MOCK_ATTACHMENTS],
      },
    });
    const c = f.componentInstance;

    c.BeforeUnlink.subscribe((e: BeforeUnlinkAttachmentEventArgs) => {
      e.Cancel = true;
      e.CancelReason = 'Test veto';
    });

    const result = await c.UnlinkAttachment(MOCK_ATTACHMENTS[0]);
    expect(result).toBe(false);
    expect(c.Attachments.length).toBe(3);
  });

  it('honors BeforeDelete cancellation', async () => {
    const f = renderComponentFixture(RecordAttachmentsComponent, {
      ...MOD,
      inputs: {
        Attachments: [...MOCK_ATTACHMENTS],
      },
    });
    const c = f.componentInstance;

    c.BeforeDelete.subscribe((e: BeforeDeleteAttachmentEventArgs) => {
      e.Cancel = true;
    });

    const result = await c.DeleteAttachment(MOCK_ATTACHMENTS[0], true);
    expect(result).toBe(false);
    expect(c.Attachments.length).toBe(3);
  });

  it('honors BeforePreview cancellation', async () => {
    const f = renderComponentFixture(RecordAttachmentsComponent, {
      ...MOD,
      inputs: {
        Attachments: [...MOCK_ATTACHMENTS],
      },
    });
    const c = f.componentInstance;

    c.BeforePreview.subscribe((e: BeforePreviewAttachmentEventArgs) => {
      e.Cancel = true;
    });

    const result = await c.PreviewAttachment(MOCK_ATTACHMENTS[0]);
    expect(result).toBe(false);
    expect(c.PreviewModalOpen).toBe(false);
  });

  it('honors BeforeUpload cancellation', async () => {
    const f = renderComponentFixture(RecordAttachmentsComponent, {
      ...MOD,
      inputs: {
        EntityID: 'e-1',
        RecordID: 'r-1',
        Attachments: [...MOCK_ATTACHMENTS],
      },
    });
    const c = f.componentInstance;

    c.BeforeUpload.subscribe((e: BeforeUploadAttachmentEventArgs) => {
      e.Cancel = true;
    });

    const mockFile = new File(['test content'], 'sample.txt', { type: 'text/plain' });
    const uploaded = await c.UploadFiles([mockFile]);
    expect(uploaded.length).toBe(0);
  });

  it('emits PanelClosed when ClosePanel is called', () => {
    const f = renderComponentFixture(RecordAttachmentsComponent, {
      ...MOD,
    });
    const spy = vi.spyOn(f.componentInstance.PanelClosed, 'emit');
    f.componentInstance.ClosePanel();
    expect(spy).toHaveBeenCalled();
  });
});
