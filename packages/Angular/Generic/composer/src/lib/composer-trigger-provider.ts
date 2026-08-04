import { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';

/**
 * A configuration preset attached to a mention suggestion (e.g. an agent's
 * Fast / Standard / High Power presets). When a suggestion carries 2+ presets the
 * mention editor renders a preset picker on the inserted chip; the selected preset's
 * ID/Name travel with the chip (`data-preset-id` / `data-preset-name`) and survive
 * serialization via `getPlainTextWithJsonMentions()`.
 *
 * This is a deliberately generic shape — the composer has no knowledge of what a
 * preset IS. Trigger providers map their domain objects (e.g. `MJ: AI Agent
 * Configurations` rows) into this shape when building suggestions.
 */
export interface MentionSuggestionPreset {
  /** Stable identifier stored on the chip (`data-preset-id`). */
  ID: string;
  /** Machine name stored on the chip (`data-preset-name`). */
  Name: string;
  /** Friendly label shown in the preset picker (falls back to Name). */
  DisplayName?: string;
  /** Optional descriptive text shown under the preset label. */
  Description?: string;
  /** The preset preselected on chip insert. First preset wins when none is flagged. */
  IsDefault?: boolean;
}

/**
 * Item in the mention-autocomplete dropdown, and the payload carried by an inserted
 * mention chip. Fully generic — `type` is an open string (providers choose their own
 * vocabulary, e.g. 'agent' | 'user' | 'entity' | 'query' | 'skill'); the editor and
 * dropdown only use it for cosmetic styling (chip palette, badge label) and for the
 * plain-text serialization prefix.
 */
export interface MentionSuggestion {
  /** Open string discriminator chosen by the provider (drives chip/badge styling). */
  type: string;
  id: string;
  name: string;
  displayName: string;
  description?: string;
  /** Image rendered in the dropdown row + chip when present (e.g. an agent LogoURL). */
  imageUrl?: string;
  /** Font Awesome (or custom) icon class for the dropdown row + chip. */
  icon?: string;
  /** Accent color for the chip/badge (e.g. a skill's own Color UX metadata). */
  color?: string;
  /** Optional presets — 2+ presets render a preset picker on the inserted chip. */
  presets?: MentionSuggestionPreset[];
  /** Provider-defined extra payload; the composer never inspects it. */
  data?: Record<string, unknown>;
}

/**
 * Request passed to {@link ComposerTriggerProvider.GetSuggestions} each time the user
 * types after an active trigger character.
 */
export interface ComposerSuggestionRequest {
  /** The text typed after the trigger character (may be empty — show the full list). */
  Query: string;
  /** Maximum number of suggestions the editor will display; providers should honor it. */
  MaxResults: number;
  /** The current user, when the host supplied one. Providers should fail closed (return []) if they require a user and none is present. */
  ContextUser: UserInfo | null;
  /** The metadata provider scoping this editor instance, when the host supplied one (multi-provider support). */
  Provider: IMetadataProvider | null;
}

/**
 * Pluggable mention/command trigger for the composer's mention editor.
 *
 * Each provider owns ONE trigger character (e.g. '@', '#', '/') and supplies the
 * suggestions shown while the user types after it. The composer itself ships with
 * ZERO providers — it is a plain text editor until providers are supplied, either:
 *
 * 1. **Explicitly** — bind `[TriggerProviders]` on `mj-mention-editor` /
 *    `mj-message-input-box` with provider instances (explicit list always wins), or
 * 2. **By discovery** — register subclasses with the MJ ClassFactory via
 *    `@RegisterClass(ComposerTriggerProvider, '<Key>')`; the editor resolves them
 *    through {@link DiscoverComposerTriggerProviders} when no explicit list is bound.
 *    Hosts opt individual triggers out with `[ExcludedTriggerKeys]`.
 *
 * The AI-aware providers (agent mentions, entity/query record mentions, skill
 * commands) live in `@memberjunction/ng-conversations` — see its `composer-plugins`
 * folder and the `mj-ai-composer` wrapper component.
 */
export abstract class ComposerTriggerProvider {
  /** The single character that opens this provider's autocomplete (e.g. '@'). */
  public abstract readonly TriggerChar: string;

  /**
   * Stable identifier for this provider (e.g. 'agent-mentions'). Used as the
   * ClassFactory registration key and by `ExcludedTriggerKeys` filtering.
   */
  public abstract readonly Key: string;

  /**
   * Ordering weight — higher runs first. When multiple providers share a
   * TriggerChar, results are concatenated in priority order (then Key order).
   */
  public readonly Priority: number = 0;

  /**
   * Returns the suggestions for the current query. Called on every keystroke after
   * an active trigger; implementations should be fast (serve from warm caches) and
   * must never throw — return [] on failure.
   */
  public abstract GetSuggestions(request: ComposerSuggestionRequest): Promise<MentionSuggestion[]>;

  /**
   * Optional warm-up hook, invoked once by the editor when it initializes with this
   * provider active. Default is a no-op; override to pre-load caches so the first
   * keystroke is fast. Must be safe to call repeatedly and concurrently.
   */
  public async Initialize(contextUser: UserInfo | null): Promise<void> {
    // default no-op — providers override to warm caches
    void contextUser;
  }
}

/**
 * One instance per registered provider subclass, shared across all editors in the
 * process — providers are expected to be stateless facades over shared engines, so a
 * single instance avoids duplicate cache warm-ups.
 */
const discoveredProviderInstances = new Map<unknown, ComposerTriggerProvider>();

/**
 * Resolves every `@RegisterClass(ComposerTriggerProvider, ...)` registration in the
 * MJ ClassFactory into a provider instance list.
 *
 * - Instantiates each winning registration once (module-level cache keyed by the
 *   registered subclass) — repeated calls are cheap.
 * - When multiple registrations share a Key, the ClassFactory's highest-priority
 *   registration wins (standard override-by-import-order semantics).
 * - `excludedKeys` filters providers out by their stable Key (case-insensitive).
 * - Returns [] gracefully when nothing is registered — the editor then behaves as a
 *   plain text editor.
 *
 * Results are sorted by provider `Priority` (desc), then `Key` (asc) for stability.
 */
export function DiscoverComposerTriggerProviders(excludedKeys?: string[]): ComposerTriggerProvider[] {
  const factory = MJGlobal.Instance.ClassFactory;
  const registrations = factory.GetAllRegistrations(ComposerTriggerProvider);
  if (!registrations || registrations.length === 0) {
    return [];
  }

  const excluded = new Set((excludedKeys ?? []).map((k) => k.trim().toLowerCase()));
  const seenKeys = new Set<string>();
  const providers: ComposerTriggerProvider[] = [];

  for (const registration of registrations) {
    const normalizedKey = registration.Key?.trim().toLowerCase();
    if (!normalizedKey || seenKeys.has(normalizedKey) || excluded.has(normalizedKey)) {
      continue;
    }
    seenKeys.add(normalizedKey);

    // Resolve the WINNING registration for this key (there may be multiple when a
    // consumer overrides a provider) — mirrors GetRegistration's priority semantics.
    const winner = factory.GetRegistration(ComposerTriggerProvider, registration.Key);
    if (!winner?.SubClass) {
      continue;
    }

    let instance = discoveredProviderInstances.get(winner.SubClass);
    if (!instance) {
      const ProviderConstructor = winner.SubClass as new () => ComposerTriggerProvider;
      instance = new ProviderConstructor();
      discoveredProviderInstances.set(winner.SubClass, instance);
    }
    providers.push(instance);
  }

  return providers.sort((a, b) => {
    if (b.Priority !== a.Priority) return b.Priority - a.Priority;
    return a.Key.localeCompare(b.Key);
  });
}
