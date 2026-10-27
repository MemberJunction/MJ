/**
 * Platform-string branches in the SQL query path that predate the PlatformStringCompliance check,
 * one entry per flagged line (file relative to packages/, and the line's trimmed text). Remove an
 * entry when its branch is converted to a dialect fact; never add one.
 */
export const PLATFORM_STRING_BASELINE: ReadonlyArray<{ File: string; Text: string }> = [
    {
        File: 'GenericDatabaseProvider/src/GenericDatabaseProvider.ts',
        Text: "isPostgres: this.PlatformKey === 'postgresql',",
    },
    {
        File: 'MJCoreEntitiesServer/src/custom/query-extraction/sync.ts',
        Text: "if (platform === 'postgresql') {",
    },
];
