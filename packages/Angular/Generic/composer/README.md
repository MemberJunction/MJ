# @memberjunction/ng-composer

Generic message-composer components for MemberJunction Angular applications — the mention editor, its autocomplete dropdown, and the send-button input box wrapper. Extracted from `@memberjunction/ng-conversations` so lower-level packages (e.g. `@memberjunction/ng-user-routines`) can embed the composer without depending on the full conversations stack (`ng-conversations` itself depends on `ng-user-routines`, so the composer must live below both).

**The composer ships ZERO AI knowledge.** Mention/command triggers are pluggable: without any trigger providers the editor is a plain text editor with attachments. The AI-aware providers ('@' agents, '#' entities/queries, '/' skills) live in `@memberjunction/ng-conversations`.

## Components

| Selector | Class | Purpose |
|---|---|---|
| `mj-mention-editor` | `MentionEditorComponent` | ContentEditable editor with Slack/Teams-style mention chips, attachment support (paste / drag-drop / picker), and `ControlValueAccessor` (`[(ngModel)]` works) |
| `mj-mention-dropdown` | `MentionDropdownComponent` | Keyboard-navigable autocomplete dropdown for mention suggestions |
| `mj-message-input-box` | `MessageInputBoxComponent` | Presentational wrapper around the mention editor adding the send button (+ optional voice / plan-mode buttons) |

Plus the trigger-provider contract (`ComposerTriggerProvider`, `ComposerSuggestionRequest`, `DiscoverComposerTriggerProviders`) and the exported types `MentionSuggestion`, `MentionSuggestionPreset`, and `PendingAttachment`.

## Pluggable triggers — the `ComposerTriggerProvider` contract

Each provider owns ONE trigger character and supplies the suggestions shown while the user types after it:

```typescript
export abstract class ComposerTriggerProvider {
  public abstract readonly TriggerChar: string;   // e.g. '@'
  public abstract readonly Key: string;           // stable id, e.g. 'agent-mentions'
  public readonly Priority: number = 0;           // higher first when chars collide
  public abstract GetSuggestions(request: ComposerSuggestionRequest): Promise<MentionSuggestion[]>;
  public async Initialize(contextUser: UserInfo | null): Promise<void> { /* optional warm-up */ }
}
```

Suggestions are generic (`type` is an open string; optional `icon` / `color` / `imageUrl` drive chip + dropdown cosmetics). A suggestion may carry `presets` — when there are 2+ the inserted chip renders a preset picker and the selection travels with the chip (`data-preset-id` / `data-preset-name`, surviving `getPlainTextWithJsonMentions()` serialization).

### Two ways to supply providers

1. **Explicit mode** — bind instances; exactly this list is active (wins over discovery):
   ```html
   <mj-mention-editor [TriggerProviders]="myProviders" ...></mj-mention-editor>
   ```
2. **Discovery mode** (default, `TriggerProviders` unbound) — the editor resolves every
   ClassFactory registration of `ComposerTriggerProvider`:
   ```typescript
   @RegisterClass(ComposerTriggerProvider, 'agent-mentions')
   export class AgentMentionProvider extends ComposerTriggerProvider { ... }
   ```
   Hosts opt individual triggers out by stable key:
   ```html
   <mj-mention-editor [ExcludedTriggerKeys]="['agent-mentions']" ...></mj-mention-editor>
   ```
   With **no providers registered**, the editor degrades gracefully to a plain text editor.

`enableMentions` (default `true`) remains the master switch — when `false`, no providers are consulted at all. `MessageInputBoxComponent` passes `enableMentions` / `TriggerProviders` / `ExcludedTriggerKeys` / `Provider` through to the editor.

### The AI providers + the `mj-ai-composer` wrapper

`@memberjunction/ng-conversations` registers three plugins (loaded via its `LoadComposerPlugins()` guard):

| Key | Trigger | Suggests |
|---|---|---|
| `agent-mentions` | `@` | Permission-filtered agents (+ configuration presets) and users |
| `record-mentions` | `#` | Entities the user can read + queries the user can run |
| `skill-commands` | `/` | Active skills the user can Run |

It also ships **`<mj-ai-composer>`** — a wrapper around `mj-message-input-box` with those plugins built in and the familiar convenience flags `EnableAgentMentions` / `EnableEntityMentions` / `EnableSkillCommands` (all default `true`). Use it wherever you want the standard AI chat composer; use the raw `mj-message-input-box` / `mj-mention-editor` for custom or discovery-driven trigger sets.

```html
<!-- Example: the routine editor — discovery mode, '@' excluded (its agent is fixed by a picker) -->
<mj-mention-editor
  [(ngModel)]="InitialMessage"
  [ExcludedTriggerKeys]="['agent-mentions']"
  [enableAttachments]="false"
  [autoFocus]="false"
  [currentUser]="ProviderToUse.CurrentUser">
</mj-mention-editor>
```

Other notable inputs: `autoFocus` (default `true` — the chat-composer behavior; set `false` when embedding in a form), `enableAttachments` / `maxAttachments` / `maxAttachmentSizeBytes` / `acceptedFileTypes`, `placeholder`, `disabled`, `Provider` (multi-provider hosts; threaded to providers via `ComposerSuggestionRequest.Provider`).

## Value formats

- **`[(ngModel)]` / `valueChange`** carry the *plain-text* serialization: mention chips render as `@Name` (agents/users), `#Name` (entities/queries), or `/Name` (skills), quoted when the name contains spaces (e.g. `#"Membership Renewals"`); line breaks become `\n`.
- **`getPlainTextWithJsonMentions()`** (used by `MessageInputBoxComponent`'s send path) encodes each chip as `@{"type":"agent","id":"...","name":"...",...}` so configuration presets survive persistence.
- `writeValue` renders inbound text as plain text (chips are not re-hydrated from text).

## Usage

```typescript
import { ComposerModule } from '@memberjunction/ng-composer';

@NgModule({ imports: [ComposerModule] })
export class MyModule {}
```

## Consumers

- `@memberjunction/ng-conversations` — hosts the AI trigger plugins + `mj-ai-composer`; the chat message composer (`message-input`, chat area, overlay, workspace)
- `@memberjunction/ng-user-routines` — the routine editor's "Message sent on each run" field (discovery mode, `agent-mentions` excluded)
- `@memberjunction/ng-explorer-core` — the Chat resource wrapper
- `@memberjunction/ng-dashboards` — Component Studio AI assistant (types only)
