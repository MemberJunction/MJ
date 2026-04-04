/**
 * Type-level configuration shared by all content sources of the same source type.
 *
 * Content Source Types represent the plugin mechanism for bringing content into the
 * autotagging pipeline (e.g. "Entity", "File", "Web"). Each type registers a `DriverClass`
 * that the ClassFactory resolves at runtime. This interface is the extension point for
 * settings that apply uniformly to every source instance of that type.
 *
 * Currently reserved for future use. As the plugin architecture matures, expect properties
 * such as default credential templates, rate-limit policies, or shared vectorization
 * settings to be added here.
 */
export interface IContentSourceTypeConfiguration {
    /** Reserved for future type-wide settings shared by all sources of this type */
}