import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { describe, expect, it } from 'vitest';
import { renderComponentFixture } from '@memberjunction/ng-test-utils';
import type { MJArtifactVersionEntity } from '@memberjunction/core-entities';
import { MarkdownArtifactViewerComponent } from './markdown-artifact-viewer.component';
import { DocumentCollaborationService } from '../../services/document-collaboration.service';
import { DocumentImportExportService } from '../../services/document-import-export.service';

@Component({
  standalone: true,
  selector: 'mj-markdown',
  template: `<div class="stub-mj-markdown">{{ data }}</div>`,
})
class StubMarkdownComponent {
  @Input() data: string | null = null;
  @Input() enableCollapsibleHeadings = false;
  @Input() enableLineNumbers = false;
  @Input() enableSyntaxHighlight = false;
  @Input() enableSmartypants = false;
  @Input() enableHtml = false;
  @Input() enableCodeCopy = false;
  @Input() enableHeadingIds = false;
}

@Component({
  standalone: true,
  selector: 'mj-artifact-type-plugin-viewer',
  template: `<div class="stub-ole-plugin" [attr.data-readonly]="readonly">{{ ArtifactTypeName || artifactTypeName }}</div>`,
})
class StubArtifactTypePluginViewerComponent {
  @Input() artifactVersion!: MJArtifactVersionEntity;
  @Input() artifactTypeName = '';
  @Input() ArtifactTypeName = '';
  @Input() contentType?: string;
  @Input() driverClass?: string;
  @Input() height?: string;
  @Input() readonly = false;
  @Input() cssClass?: string;
  @Output() ContentCommitted = new EventEmitter<string>();
}

const INITIAL_DOC_CONTENT = [
  '# Q4 Strategy Document',
  '',
  'Initial narrative paragraph.',
  '',
  '## Live Metrics Section',
  '',
  ':::mj-block',
  '{',
  '  "BlockID": "blk-live-1",',
  '  "Kind": "EntityView",',
  '  "Mode": "Live",',
  '  "Title": "Active Projects",',
  '  "EntityName": "MJ: Projects"',
  '}',
  ':::',
  '',
  '## Architecture Whiteboard',
  '',
  ':::mj-block',
  '{',
  '  "BlockID": "blk-wb-1",',
  '  "Kind": "Artifact",',
  '  "Mode": "Live",',
  '  "Title": "System Diagram",',
  '  "ArtifactID": "wb-inline-1",',
  '  "ArtifactType": "Whiteboard",',
  '  "EmbedMode": "Inline"',
  '}',
  ':::',
].join('\n');

describe('MarkdownArtifactViewerComponent (DOM)', () => {
  function renderDocsViewer(content = INITIAL_DOC_CONTENT, readonly = false) {
    return renderComponentFixture(MarkdownArtifactViewerComponent, {
      imports: [
        CommonModule,
        FormsModule,
        StubMarkdownComponent,
        StubArtifactTypePluginViewerComponent,
      ],
      declarations: [MarkdownArtifactViewerComponent],
      providers: [DocumentCollaborationService, DocumentImportExportService],
      inputs: {
        artifactVersion: {
          ID: 'ver-doc-1',
          ArtifactID: 'art-doc-1',
          VersionNumber: 1,
          Name: 'Q4 Strategy Document',
          Content: content,
        } as unknown as MJArtifactVersionEntity,
        readonly,
      },
    });
  }

  it('renders workspace toolbar, TOC outline rail, live MJ block, and inline OLE Artifact block', () => {
    const f = renderDocsViewer();
    const root = f.nativeElement as HTMLElement;

    expect(root.querySelector('[data-testid="mj-docs-toolbar"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="docs-outline-rail"]')).not.toBeNull();

    // Outline items include both headings and embedded blocks
    expect(f.componentInstance.OutlineItems.length).toBe(5);
    expect(f.componentInstance.WordStats.LiveBlocks).toBe(1);
    expect(f.componentInstance.WordStats.EmbeddedArtifacts).toBe(1);

    // Live block card and OLE artifact card are rendered
    expect(root.querySelector('[data-testid="live-mj-block-blk-live-1"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="ole-artifact-block-blk-wb-1"]')).not.toBeNull();
  });

  it('opens Slash Command Menu (/), filters commands, and inserts an inline Whiteboard OLE block', () => {
    const f = renderDocsViewer('# Simple Doc', false);
    f.componentInstance.SetViewMode('edit');
    f.detectChanges();

    f.componentInstance.ToggleSlashMenu();
    f.detectChanges();
    const root = f.nativeElement as HTMLElement;
    expect(root.querySelector('[data-testid="slash-command-menu"]')).not.toBeNull();

    const wbCmd = f.componentInstance.FilteredSlashCommands.find((c) => c.Command === '/whiteboard')!;
    expect(wbCmd).toBeDefined();

    f.componentInstance.ExecuteSlashCommand(wbCmd);
    f.detectChanges();
    expect(root.querySelector('[data-testid="insert-block-modal"]')).not.toBeNull();

    f.componentInstance.ConfirmBlockInsertModal();
    f.detectChanges();

    expect(f.componentInstance.MarkdownContent).toContain('"ArtifactType": "Whiteboard"');
    expect(f.componentInstance.WordStats.EmbeddedArtifacts).toBe(1);
  });

  it('enforces O5 Security Warning confirmation modal before freezing a live MJ block', async () => {
    const f = renderDocsViewer();
    const root = f.nativeElement as HTMLElement;

    const liveSeg = f.componentInstance.DocumentSegments.find((s) => s.SegmentID === 'blk-live-1')!;
    expect(liveSeg.Descriptor?.Mode).toBe('Live');

    f.componentInstance.PromptFreezeBlock(liveSeg.Descriptor!);
    f.detectChanges();

    const modal = root.querySelector('[data-testid="freeze-warning-modal"]');
    expect(modal).not.toBeNull();

    const confirmBtn = root.querySelector<HTMLButtonElement>('[data-testid="confirm-freeze-btn"]')!;
    expect(confirmBtn.disabled).toBe(true);

    // Acknowledge warning checkbox -> confirm button enabled
    f.componentInstance.SetFreezeWarningAcknowledged(true);
    f.detectChanges();
    expect(confirmBtn.disabled).toBe(false);

    await f.componentInstance.ConfirmFreezeBlock();
    f.detectChanges();

    const afterSeg = f.componentInstance.DocumentSegments.find((s) => s.SegmentID === 'blk-live-1')!;
    expect(afterSeg.Descriptor?.Mode).toBe('Frozen');
    expect(afterSeg.Descriptor?.FrozenSnapshot?.SecurityWarningAcknowledged).toBe(true);
  });

  it('toggles inline OLE editing on an embedded Whiteboard block and updates VersionID on ContentCommitted', () => {
    const f = renderDocsViewer();
    const wbSeg = f.componentInstance.DocumentSegments.find((s) => s.SegmentID === 'blk-wb-1')!;

    expect(f.componentInstance.IsInlineEditingBlock('blk-wb-1')).toBe(false);
    f.componentInstance.ToggleInlineArtifactEdit(wbSeg.Descriptor!);
    f.detectChanges();
    expect(f.componentInstance.IsInlineEditingBlock('blk-wb-1')).toBe(true);

    f.componentInstance.OnEmbeddedArtifactContentCommitted(
      wbSeg.Descriptor!,
      JSON.stringify({ version: 2, pages: [{ id: 'page-1', name: 'Updated', items: [] }] }),
    );
    f.detectChanges();

    const updatedWbSeg = f.componentInstance.DocumentSegments.find((s) => s.SegmentID === 'blk-wb-1')!;
    expect(updatedWbSeg.Descriptor?.VersionID).toBe('ver-wb-inline-1-2');
  });

  it('supports Suggest Mode tracked changes, Anchored DocBlock comments with @mention agent reply, and Version Diff view', async () => {
    const f = renderDocsViewer();
    const root = f.nativeElement as HTMLElement;

    // 1. Create and accept a tracked suggestion
    const firstSeg = f.componentInstance.DocumentSegments[0];
    f.componentInstance.OpenSuggestionModalForSegment(firstSeg);
    f.detectChanges();
    expect(f.componentInstance.PendingSuggestionsCount).toBe(1);

    const suggestion = f.componentInstance.Suggestions[0];
    f.componentInstance.AcceptSuggestion(suggestion);
    f.detectChanges();
    expect(f.componentInstance.PendingSuggestionsCount).toBe(0);
    expect(f.componentInstance.MarkdownContent).toContain('Suggested refinement for this section.');

    // 2. Post an anchored DocBlock comment with @DocsAgent mention
    f.componentInstance.OpenAnchorCommentForSegment(firstSeg);
    f.componentInstance.NewCommentAgentMode = 'suggest';
    f.componentInstance.NewCommentText = 'Please tighten this heading @DocsAgent';
    await f.componentInstance.PostAnchoredComment();
    f.detectChanges();

    expect(root.querySelector('[data-testid="docs-comments-drawer"]')).not.toBeNull();
    expect(f.componentInstance.AnchoredThreads.length).toBeGreaterThanOrEqual(1);
    const newThread = f.componentInstance.AnchoredThreads[0];
    expect(newThread.Messages).toHaveLength(2); // User comment + @DocsAgent reply
    expect(newThread.Messages[1].Role).toBe('Agent');

    // 3. Switch to Version Diff mode
    f.componentInstance.SetViewMode('diff');
    f.detectChanges();
    expect(root.querySelector('[data-testid="docs-diff-view"]')).not.toBeNull();
    expect(f.componentInstance.CurrentDiff.AddedLines).toBeGreaterThan(0);
  });
});
