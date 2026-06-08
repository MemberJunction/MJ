/**
 * @fileoverview Classify · Org-level domain-context editor.
 *
 * Reads and writes the `classify.org.context` `MJ: Application Settings` record
 * scoped to the Knowledge Hub application. This is the ORG scope of the
 * three-tier classification context (org → content-type → source) consumed by
 * the server-side `ClassificationContextResolver` during autotagging.
 *
 * Persists via `ApplicationSettingEngine.SetSetting`, which creates the record
 * if absent (or updates it) and checks the Save() result. The Knowledge Hub
 * application ID is resolved by name via the threaded provider.
 */
import { Component, ChangeDetectorRef, inject } from '@angular/core';
import { RunView } from '@memberjunction/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { ApplicationSettingEngine } from '@memberjunction/core-entities';

const KNOWLEDGE_HUB_APPLICATION_NAME = 'Knowledge Hub';
const CLASSIFY_ORG_CONTEXT_SETTING_KEY = 'classify.org.context';

@Component({
    standalone: false,
    selector: 'classify-org-context-editor',
    templateUrl: './classify-org-context-editor.component.html',
    styleUrls: ['./classify-org-context-editor.component.css']
})
export class ClassifyOrgContextEditorComponent extends BaseAngularComponent {
    private cdr = inject(ChangeDetectorRef);

    /** Whether the editor body is expanded. */
    public Expanded = false;
    /** The org-context text bound to the textarea. */
    public ContextText = '';
    /** The value last loaded/saved, used to detect unsaved edits. */
    private savedText = '';
    /** Loading spinner while reading the setting. */
    public IsLoading = false;
    /** Saving spinner. */
    public IsSaving = false;
    /** Whether the initial load has run. */
    private loaded = false;

    private khApplicationID: string | null | undefined = undefined;

    /** True when the textarea differs from the persisted value. */
    public get HasUnsavedChanges(): boolean {
        return this.ContextText !== this.savedText;
    }

    /** Toggle the editor open/closed, lazy-loading the value the first time. */
    public async Toggle(): Promise<void> {
        this.Expanded = !this.Expanded;
        if (this.Expanded && !this.loaded) {
            await this.load();
        }
        this.cdr.detectChanges();
    }

    private async resolveKnowledgeHubApplicationID(): Promise<string | null> {
        if (this.khApplicationID !== undefined) return this.khApplicationID;
        const rv = RunView.FromMetadataProvider(this.ProviderToUse);
        const result = await rv.RunView<{ ID: string }>({
            EntityName: 'MJ: Applications',
            ExtraFilter: `Name = '${KNOWLEDGE_HUB_APPLICATION_NAME.replace(/'/g, "''")}'`,
            Fields: ['ID'],
            MaxRows: 1,
            ResultType: 'simple',
        });
        this.khApplicationID = result.Success && result.Results.length > 0 ? result.Results[0].ID : null;
        return this.khApplicationID;
    }

    private async load(): Promise<void> {
        this.IsLoading = true;
        this.cdr.detectChanges();
        try {
            const p = this.ProviderToUse;
            await ApplicationSettingEngine.Instance.Config(false, p.CurrentUser, p);
            const appID = await this.resolveKnowledgeHubApplicationID();
            const raw = ApplicationSettingEngine.Instance.GetSetting(
                CLASSIFY_ORG_CONTEXT_SETTING_KEY,
                appID ?? undefined,
            );
            this.ContextText = raw ?? '';
            this.savedText = this.ContextText;
            this.loaded = true;
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            MJNotificationService.Instance.CreateSimpleNotification(`Failed to load org context: ${msg}`, 'error', 4000);
        } finally {
            this.IsLoading = false;
            this.cdr.detectChanges();
        }
    }

    /** Persist the org-level context to the Knowledge Hub application scope. */
    public async Save(): Promise<void> {
        if (this.IsSaving) return;
        this.IsSaving = true;
        this.cdr.detectChanges();
        try {
            const p = this.ProviderToUse;
            const appID = await this.resolveKnowledgeHubApplicationID();
            const ok = await ApplicationSettingEngine.Instance.SetSetting(
                CLASSIFY_ORG_CONTEXT_SETTING_KEY,
                this.ContextText,
                appID ?? undefined,
                p.CurrentUser,
            );
            if (ok) {
                this.savedText = this.ContextText;
                MJNotificationService.Instance.CreateSimpleNotification('Org context saved', 'success', 2500);
            } else {
                MJNotificationService.Instance.CreateSimpleNotification('Failed to save org context', 'error', 4000);
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            MJNotificationService.Instance.CreateSimpleNotification(`Error: ${msg}`, 'error', 4000);
        } finally {
            this.IsSaving = false;
            this.cdr.detectChanges();
        }
    }
}
