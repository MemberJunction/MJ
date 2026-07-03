# @memberjunction/ng-composer

Generic message-composer components for MemberJunction Angular applications — the mention editor, its autocomplete dropdown + service, and the send-button input box wrapper. Extracted from `@memberjunction/ng-conversations` so lower-level packages (e.g. `@memberjunction/ng-user-routines`) can embed the composer without depending on the full conversations stack (`ng-conversations` itself depends on `ng-user-routines`, so the composer must live below both).

## Components

| Selector | Class | Purpose |
|---|---|---|
| `mj-mention-editor` | `MentionEditorComponent` | ContentEditable editor with Slack/Teams-style mention chips, attachment support (paste / drag-drop / picker), and `ControlValueAccessor` (`[(ngModel)]` works) |
| `mj-mention-dropdown` | `MentionDropdownComponent` | Keyboard-navigable autocomplete dropdown for mention suggestions |
| `mj-message-input-box` | `MessageInputBoxComponent` | Presentational wrapper around the mention editor adding the send button (+ optional voice / plan-mode buttons) |

Plus `MentionAutocompleteService` (root-provided; loads permission-filtered agents / entities / queries / skills once per session) and the exported types `MentionSuggestion` and `PendingAttachment`.

## Mention triggers and the granular toggles

The editor supports three trigger characters, each individually toggleable:

| Trigger | Suggests | Toggle input |
|---|---|---|
| `@` | Agents + users | `enableAgentMentions` (default `true`) |
| `#` | Entities + queries | `enableEntityMentions` (default `true`) |
| `/` | Skills | `enableSkillCommands` (default `true`) |

`enableMentions` (default `true`) is the master switch — when `false`, all three triggers are disabled regardless of the granular toggles. `MessageInputBoxComponent` passes all four through.

```html
<!-- Example: entity mentions + skill commands only (the routine editor) -->
<mj-mention-editor
  [(ngModel)]="InitialMessage"
  [enableAgentMentions]="false"
  [enableEntityMentions]="true"
  [enableSkillCommands]="true"
  [enableAttachments]="false"
  [autoFocus]="false"
  [currentUser]="ProviderToUse.CurrentUser">
</mj-mention-editor>
```

Other notable inputs: `autoFocus` (default `true` — the chat-composer behavior; set `false` when embedding in a form), `enableAttachments` / `maxAttachments` / `maxAttachmentSizeBytes` / `acceptedFileTypes`, `placeholder`, `disabled`.

## Value formats

- **`[(ngModel)]` / `valueChange`** carry the *plain-text* serialization: mention chips render as `@Name` (agents/users), `#Name` (entities/queries), or `/Name` (skills), quoted when the name contains spaces (e.g. `#"Membership Renewals"`); line breaks become `\n`.
- **`getPlainTextWithJsonMentions()`** (used by `MessageInputBoxComponent`'s send path) encodes each chip as `@{"type":"agent","id":"...","name":"...",...}` so agent-configuration presets survive persistence.
- `writeValue` renders inbound text as plain text (chips are not re-hydrated from text).

## Usage

```typescript
import { ComposerModule } from '@memberjunction/ng-composer';

@NgModule({ imports: [ComposerModule] })
export class MyModule {}
```

## Consumers

- `@memberjunction/ng-conversations` — the chat message composer (`message-input`, chat area, overlay, workspace)
- `@memberjunction/ng-user-routines` — the routine editor's "Message sent on each run" field
- `@memberjunction/ng-explorer-core` — the Chat resource wrapper
- `@memberjunction/ng-dashboards` — Component Studio AI assistant (types only)
