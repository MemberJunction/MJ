/**
 * Both Explorer screens that edit a content source write the form's source-type fields into
 * `Configuration.SourceSpecificConfiguration`. Keys the form does not show must survive the save. Each screen's real
 * SaveSource runs against a real content source entity whose save is captured.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { Component, EventEmitter, Input, Output, type Type } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TestBed } from '@angular/core/testing';
import { EntityInfo, type CompositeKey, type IMetadataProvider, type RunViewResult } from '@memberjunction/core';
import { MJContentSourceEntity } from '@memberjunction/core-entities';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { EntitiesOnlyProvider } from '@memberjunction/unit-testing';
import { StubEmptyStateComponent, StubLoadingComponent } from '@memberjunction/ng-test-utils';
import type { TreeBranchConfig, TreeLeafConfig, TreeSelectableTypes, TreeSelectionMode } from '@memberjunction/ng-trees';
import { MJWordCloudComponent } from '@memberjunction/ng-word-cloud';
import {
    MJButtonDirective, MJComboboxComponent, MJLeftNavComponent, MJLeftNavContentComponent,
    MJPageBodyComponent, MJPageBodyInteriorComponent, MJPageHeaderComponent, MJPageHeaderInteriorComponent, MJPageLayoutComponent,
    MJSwitchComponent, MJTabNavComponent,
} from '@memberjunction/ng-ui-components';
import { ClassifySourceTypeFormDialogComponent } from './source-type-form.dialog.component';
import { TagsResourceComponent } from '../../tags/tags-resource.component';

/** Inert `<mj-tree-dropdown>`: the real one loads its branches and leaves through the provider on init. */
@Component({ standalone: true, selector: 'mj-tree-dropdown', template: '' })
class TreeDropdownStub {
    @Input() BranchConfig: TreeBranchConfig | null = null;
    @Input() LeafConfig: TreeLeafConfig | null = null;
    @Input() SelectionMode: TreeSelectionMode = 'single';
    @Input() SelectableTypes: TreeSelectableTypes = 'both';
    @Input() Placeholder = '';
    @Input() Clearable = true;
    @Input() Value: CompositeKey | CompositeKey[] | null = null;
    @Output() ValueChange = new EventEmitter<CompositeKey | CompositeKey[] | null>();
}

/** The children both screens' templates use: the real light UI components, and stubs for the data-loading ones. */
const CHILDREN = [
    FormsModule, MJButtonDirective, MJSwitchComponent, MJComboboxComponent, MJLeftNavComponent, MJLeftNavContentComponent,
    MJPageLayoutComponent, MJPageHeaderComponent, MJPageBodyComponent, MJPageHeaderInteriorComponent, MJPageBodyInteriorComponent,
    MJTabNavComponent, MJWordCloudComponent,
    TreeDropdownStub, StubLoadingComponent, StubEmptyStateComponent,
];

const STORED = { SourceSpecificConfiguration: { Language: 'en', URL: 'https://old.example.com' } };

/** The stored source: an RSS-style source whose configuration holds a key the form does not show. */
function storedSource(): MJContentSourceEntity {
    const entityID = 'entity-content-sources';
    const info = new EntityInfo({
        ID: entityID, Name: 'MJ: Content Sources',
        Fields: ['ID', 'Name', 'ContentSourceTypeID', 'ContentTypeID', 'ContentFileTypeID', 'URL', 'EntityID', 'EntityDocumentID', 'Configuration', 'EmbeddingModelID', 'VectorIndexID']
            .map((field, index) => ({ ID: `${entityID}-${field}`, EntityID: entityID, Entity: 'MJ: Content Sources', Sequence: index + 1, Name: field, Type: 'nvarchar', IsPrimaryKey: field === 'ID', AllowUpdateAPI: true })),
    });
    const source = new MJContentSourceEntity(info);
    source.Hydrate({ ID: 'source-1', Name: 'Feed', ContentSourceTypeID: 'type-rss', Configuration: JSON.stringify(STORED) });
    return source;
}

/** The fields both screens' source forms share. */
interface SourceForm {
    Provider: IMetadataProvider | null;
    FormMode: string;
    EditingSourceID: string;
    FormSourceName: string;
    FormSourceTypeID: string;
    FormContentTypeID: string;
    FormFileTypeID: string;
    FormSourceSpecificConfig: Record<string, string>;
    SaveSource(): Promise<void>;
}

/**
 * Saves the stored source through the screen's form, with only the URL edited, and returns the
 * SourceSpecificConfiguration that was saved.
 */
async function saveThrough<T extends SourceForm>(component: Type<T>): Promise<Record<string, unknown> | undefined> {
    TestBed.configureTestingModule({ imports: CHILDREN, declarations: [component] });
    vi.spyOn(TestBed.inject(MJNotificationService), 'CreateSimpleNotification').mockImplementation(() => undefined);
    const form = TestBed.createComponent(component).componentInstance;
    const source = storedSource();
    let saved: Record<string, unknown> | undefined;
    vi.spyOn(source, 'InnerLoad').mockResolvedValue(true);
    vi.spyOn(source, 'Save').mockImplementation(async () => {
        saved = source.ConfigurationObject?.SourceSpecificConfiguration;
        return true;
    });
    const provider = new EntitiesOnlyProvider([]);
    vi.spyOn(provider, 'GetEntityObject').mockResolvedValue(source);
    // After a save the screens reload their lists; there is nothing to list here
    const empty: RunViewResult = { Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 0, ErrorMessage: '' };
    vi.spyOn(provider, 'RunView').mockResolvedValue(empty);
    vi.spyOn(provider, 'RunViews').mockImplementation(async (params) => params.map(() => empty));
    form.Provider = provider;
    form.FormMode = 'edit-source';
    form.EditingSourceID = 'source-1';
    form.FormSourceName = 'Feed';
    form.FormSourceTypeID = 'type-rss';
    form.FormContentTypeID = 'content-type-1';
    form.FormFileTypeID = 'file-type-1';
    form.FormSourceSpecificConfig = { URL: 'https://new.example.com' };

    await form.SaveSource();
    return saved;
}

describe('saving a content source from Explorer', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        TestBed.resetTestingModule();
    });

    it('the source-type form keeps the stored keys the form does not show', async () => {
        expect(await saveThrough(ClassifySourceTypeFormDialogComponent)).toEqual({ Language: 'en', URL: 'https://new.example.com' });
    });

    it('the tags screen keeps the stored keys the form does not show', async () => {
        expect(await saveThrough(TagsResourceComponent)).toEqual({ Language: 'en', URL: 'https://new.example.com' });
    });
});
