/**
 * AUTO-COPIED FROM metadata/entities/JSONType-interfaces/IFileStorageProviderConfiguration.ts
 * DO NOT EDIT DIRECTLY. Run `pnpm run build` in MJCore to refresh.
 */

/**
 * Optional per-storage-provider configuration bag.
 * Stored as JSON in `MJ: File Storage Providers.Configuration`.
 */
export interface IFileStorageProviderConfiguration {
    /**
     * FontAwesome icon class for displaying the storage provider in UI components (e.g. 'fa-solid fa-box', 'fa-brands fa-aws').
     */
    IconClass?: string;

    /**
     * Optional brand color for badges and accents (e.g. '#0061D5').
     */
    BrandColor?: string;
}
