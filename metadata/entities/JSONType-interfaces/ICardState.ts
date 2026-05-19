/**
 * Persisted card-view configuration for a User View.
 *
 * Stored in the `CardState` column of the `User Views` entity. Controls the visual
 * presentation when the view is displayed in card mode. All properties are optional;
 * omitting them means "use component defaults."
 *
 * The card template itself (title field, subtitle, display fields, thumbnail priority)
 * is auto-derived from entity metadata at runtime — this interface only stores
 * user-chosen overrides for display preferences.
 */
export interface ICardState {
    /** Card size preset — controls card dimensions and content density */
    cardSize?: 'small' | 'medium' | 'large';
}
