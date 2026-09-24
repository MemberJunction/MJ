/** Relationship clone policy and status. */
export interface RecordCloneDescribeRelationship {
    /** Relationship display name or target entity. */
    Name: string;
    /** Related entity name. */
    RelatedEntity: string;
    /** Default clone policy applied to this relationship. */
    DefaultPolicy: 'Deep' | 'Reference' | 'Skip';
    /** Whether policy changes are locked by configuration or database constraint. */
    Locked: boolean;
    /** Optional count of child records for the specified record. */
    ChildCount?: number;
}

/** Output for `RecordClone.Describe`. */
export interface RecordCloneDescribeOutput {
    /** Whether the entity can be cloned. */
    CanClone: boolean;
    /** Optional explanation if cloning is disabled or blocked. */
    Reason?: string;
    /** Presets configured on the entity. */
    Presets?: string[];
    /** Granularity of user editing allowed. */
    UserEditable?: 'none' | 'fields' | 'scope' | 'all';
    /** Direct relationships and their clone policies. */
    Relationships: RecordCloneDescribeRelationship[];
    /** Authorization check result for the calling user. */
    Authorization?: {
        Name: string;
        Granted: boolean;
    };
    /** Whether the calling user holds `Clone Records: Fire Hooks`, so the UI may offer the Fire Entity Actions toggle. */
    CanFireHooks?: boolean;
    /** Whether the calling user holds `Clone Records: Override Scope`, so the UI may offer scope overrides beyond the entity's configuration. */
    CanOverrideScope?: boolean;
}
