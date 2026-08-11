/*
 * Public API Surface of @memberjunction/ng-composer
 */

// Module
export * from './lib/composer.module';

// Components (+ their exported types: PendingAttachment, etc.)
export * from './lib/components/mention/mention-editor.component';
export * from './lib/components/mention/mention-dropdown.component';
export * from './lib/components/message/message-input-box.component';

// Pluggable trigger-provider contract (+ MentionSuggestion / MentionSuggestionPreset /
// ComposerSuggestionRequest / DiscoverComposerTriggerProviders)
export * from './lib/composer-trigger-provider';
// Composer-specific Before/After event args (the cancelable base lives in @memberjunction/global)
export * from './lib/events/composer-events';
// NOTE: MentionAutocompleteService (the AI-aware suggestion engine) moved to
// @memberjunction/ng-conversations — import it from there directly.
