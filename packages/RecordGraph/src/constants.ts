/**
 * Patterns matching system / infrastructure foreign key fields that should not be followed
 * as standard entity dependencies during forward traversal (e.g., audit fields, context user).
 */
export const SYSTEM_FK_SKIP_PATTERNS: readonly RegExp[] = [
    /^CreatedByUserID$/i,
    /^UpdatedByUserID$/i,
    /^UserID$/i,
    /^ContextUser(ID)?$/i,
    /^ModifiedBy(UserID)?$/i,
    /^CreatedBy$/i,
    /^UpdatedBy$/i,
    /^Owner(ID|UserID)?$/i,
    /^AssignedTo(ID|UserID)?$/i,
    /^EntityID$/i,  // polymorphic entity reference, not a real FK to follow
];
