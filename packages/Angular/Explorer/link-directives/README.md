# @memberjunction/ng-link-directives

Angular directives for transforming elements into clickable email, web, or entity record links. Used throughout MemberJunction forms to make field values interactive.

## Overview

This package provides three directives that wrap elements in anchor tags based on the type of data they represent. A `BaseLink` abstract class handles the shared DOM manipulation logic. These directives are used automatically by MemberJunction's form system to make email addresses, URLs, and foreign key values clickable.

```mermaid
graph TD
    BL["BaseLink\n(Abstract)"] --> EL["EmailLinkDirective\n[mjEmailLink]"]
    BL --> WL["WebLinkDirective\n[mjWebLink]"]
    BL --> FL["FieldLinkDirective\n[mjFieldLink]"]

    EL --> MA["mailto: link"]
    WL --> HA["http(s): link"]
    FL --> RN["Router navigation\n(entity record)"]

    style BL fill:#7c5295,stroke:#563a6b,color:#fff
    style EL fill:#2d6a9f,stroke:#1a4971,color:#fff
    style WL fill:#2d6a9f,stroke:#1a4971,color:#fff
    style FL fill:#2d6a9f,stroke:#1a4971,color:#fff
    style MA fill:#2d8659,stroke:#1a5c3a,color:#fff
    style HA fill:#2d8659,stroke:#1a5c3a,color:#fff
    style RN fill:#2d8659,stroke:#1a5c3a,color:#fff
```

## Features

- **Email links**: Wraps text in a `mailto:` anchor tag
- **Web links**: Wraps text in an `http(s):` anchor tag (opens in new tab)
- **Field/Record links**: Wraps entity foreign key values as router links to navigate to the referenced record
- **Automatic styling**: Adds `link-text` CSS class with consistent font sizing
- **Lightweight**: Minimal DOM manipulation using Angular `Renderer2`

## Installation

```bash
npm install @memberjunction/ng-link-directives
```

## Key Dependencies

| Dependency | Purpose |
|---|---|
| `@memberjunction/core` | EntityField metadata |
| `@memberjunction/ng-shared` | SharedService, navigation |
| `@angular/router` | Router for record navigation |

## Usage

### Import the Module

```typescript
import { LinkDirectivesModule } from '@memberjunction/ng-link-directives';

@NgModule({
  imports: [LinkDirectivesModule]
})
export class AppModule {}
```

### Email Link

```html
<span [mjEmailLink]="emailField">user@example.com</span>
```

### Web Link

```html
<span [mjWebLink]="urlField">https://example.com</span>
```

### Field/Record Link

```html
<span [mjFieldLink]="foreignKeyField" [record]="entityRecord">Related Record</span>
```

## Exported API

| Export | Type | Description |
|---|---|---|
| `LinkDirectivesModule` | NgModule | Module with all directive declarations |
| `BaseLink` | Abstract Class | Shared link creation logic |
| `EmailLinkDirective` | Directive | `[mjEmailLink]` - creates mailto links |
| `WebLinkDirective` | Directive | `[mjWebLink]` - creates web links |
| `FieldLinkDirective` | Directive | `[mjFieldLink]` - creates record navigation links |

## Build

```bash
cd packages/Angular/Explorer/link-directives && npm run build
```

## License

ISC
