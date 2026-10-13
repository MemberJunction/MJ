import { BaseEntity, IMetadataProvider } from "@memberjunction/core";
import { MJTemplateContentEntity } from "@memberjunction/core-entities";
import { UUIDsEqual } from "@memberjunction/global";
import { TemplateEngineBase } from "@memberjunction/templates-base-types";

/** The content row a template text came from, and that row's `__mj_UpdatedAt` (epoch ms) at the time. */
interface TemplateTextSource {
    ContentID: string;
    UpdatedAt: number;
}

/**
 * The template text an entity mirrors from the content its linked Template renders: `MJ: AI Prompts` and
 * `MJ: Entity Documents` both expose a virtual `TemplateText` this way, and both hold one of these (has-a), so the two
 * cannot drift apart again.
 *
 * The text is the row the template renders — the one `MJTemplateEntityExtended.SelectHighestPriorityContent` selects,
 * as `TemplateEngineBase.FindRenderedContent` caches it — so a feature pipeline's prompt version hash, and an entity
 * document's vector-sync and duplicate-detection text, change exactly when the rendered text does. The text reads
 * through to the template engine's cache: a saved Template Content reloads the engine, and a long-lived entity (such as
 * AIEngine's cached prompts in a running server) takes the new text on its next read instead of keeping the old text
 * until restart. A cached row is adopted only when it is a different row from the one the text came from, or a later
 * version of it, and never over an unsaved local edit: an entity that has just saved its text is ahead of the cache
 * until the reload lands, and adopting the older cached row then would revert the save.
 */
export class LinkedTemplateText {
    private text = '';
    private originalText = '';
    private source: TemplateTextSource | null = null;

    /** The current text, including an unsaved local edit. */
    public get Text(): string {
        return this.text;
    }
    public set Text(value: string) {
        this.text = value;
    }

    /** The text as last loaded or saved: what {@link Dirty} compares against. */
    public get OriginalText(): string {
        return this.originalText;
    }
    public set OriginalText(value: string) {
        this.originalText = value;
    }

    /** Whether the text has an unsaved local edit. */
    public get Dirty(): boolean {
        return this.text !== this.originalText;
    }

    /** Adopts `content` when it is newer than the text's source; never over an unsaved local edit. */
    public RefreshFrom(content: MJTemplateContentEntity | undefined): void {
        if (this.Dirty || !content || !this.IsNewerThanSource(content)) {
            return;
        }
        this.Adopt(content);
    }

    /**
     * Loads the text when its record loads. A different content row, or a later version of the row the text came from,
     * replaces the text (and any unsaved edit of it, as a load replaces the record's other fields); a row no newer than
     * the text last saved does not. With no content, the text is cleared.
     * @returns true when the template has content
     */
    public Load(content: MJTemplateContentEntity | undefined): boolean {
        if (content) {
            if (this.IsNewerThanSource(content)) {
                this.Adopt(content);
            }
            return true;
        }
        this.text = '';
        this.originalText = '';
        this.source = null;
        return false;
    }

    /**
     * Records the content row the text now matches — call after saving the text into `content`, so the entity does not
     * take the engine's older cached copy of that row for an edit.
     */
    public RecordSource(content: MJTemplateContentEntity): void {
        this.source = { ContentID: content.ID, UpdatedAt: LinkedTemplateText.updatedAt(content) };
    }

    /** True when `content` is not the row the text came from, or is a later version of it. */
    protected IsNewerThanSource(content: MJTemplateContentEntity): boolean {
        if (!this.source || !UUIDsEqual(this.source.ContentID, content.ID)) {
            return true;
        }
        return LinkedTemplateText.updatedAt(content) > this.source.UpdatedAt;
    }

    /** Takes the text of `content` as the current, unmodified text. */
    protected Adopt(content: MJTemplateContentEntity): void {
        this.text = content.TemplateText || '';
        this.originalText = this.text;
        this.RecordSource(content);
    }

    /**
     * The template engine for the entity's provider: the provider's own engine instance when the provider names its
     * connection (so a multi-provider server reads the right connection's cache), else the process-wide instance — a
     * provider without a connection key cannot key an engine instance, and asking for one would build an empty
     * engine on every read.
     */
    public static EngineFor(entity: BaseEntity): TemplateEngineBase {
        const provider = LinkedTemplateText.providerOf(entity);
        if (provider?.InstanceConnectionString) {
            return TemplateEngineBase.GetProviderInstance<TemplateEngineBase>(provider, TemplateEngineBase) as TemplateEngineBase;
        }
        return TemplateEngineBase.Instance;
    }

    /** The content row the entity's linked template renders, from its provider's template cache; undefined when unknown. */
    public static RenderedContent(entity: BaseEntity, templateID: string | null): MJTemplateContentEntity | undefined {
        return templateID ? LinkedTemplateText.EngineFor(entity).FindRenderedContent(templateID) : undefined;
    }

    /** Loads the entity's provider's template cache when it has not loaded yet. */
    public static async EnsureLoaded(entity: BaseEntity): Promise<void> {
        await LinkedTemplateText.EngineFor(entity).Config(false, entity.ContextCurrentUser, LinkedTemplateText.providerOf(entity));
    }

    /**
     * The entity's provider as a metadata provider. `BaseEntity.ProviderToUse` is typed as the entity-data side of the
     * same provider object; this is the one place the two views are bridged.
     */
    private static providerOf(entity: BaseEntity): IMetadataProvider | undefined {
        return entity.ProviderToUse as unknown as IMetadataProvider | undefined;
    }

    private static updatedAt(content: MJTemplateContentEntity): number {
        return content.__mj_UpdatedAt ? new Date(content.__mj_UpdatedAt).getTime() : 0;
    }
}
