/**
 * Writes the source-type fields an Explorer form edits into a content source's `SourceSpecificConfiguration`.
 */
export class ContentSourceConfiguration {
    /**
     * The `SourceSpecificConfiguration` to save: the stored keys, with the form's values over them. Keys the form does
     * not show (such as the render version a content provider records) survive the edit, even when the form was opened
     * from an older snapshot of the source than the one being saved.
     * @param stored the source's current `SourceSpecificConfiguration`, if any
     * @param form the source-type fields the form edits
     */
    public static MergeSourceSpecific(stored: Record<string, unknown> | undefined, form: Record<string, string>): Record<string, unknown> {
        return { ...stored, ...form };
    }
}
