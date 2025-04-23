# @memberjunction/ng-link-directives

The `@memberjunction/ng-link-directives` package provides a set of Angular directives that transform text elements into different types of links based on MemberJunction entity field metadata. This makes it easy to display email addresses, URLs, and entity relationships as clickable links in your application.

## Features

- Email link directive for fields with "email" extended type
- Web link directive for fields with "url" extended type
- Field link directive for related entity fields that navigates to the related record
- Automatic value resolution for field links (displays the related entity's name)
- Target control for web links (opens in new tab)
- Styling options for all link types
- Leverages MemberJunction's metadata system

## Installation

```bash
npm install @memberjunction/ng-link-directives
```

## Requirements

- Angular 18+
- @memberjunction/core

## Usage

### Basic Setup

First, import the LinkDirectivesModule in your module:

```typescript
import { LinkDirectivesModule } from '@memberjunction/ng-link-directives';

@NgModule({
  imports: [
    // other imports...
    LinkDirectivesModule
  ],
})
export class YourModule { }
```

### Email Link Directive

The email link directive converts text into a mailto: link when the field has an extended type of "email".

```html
<span [mjEmailLink]="field">{{ field.Value }}</span>
```

Where `field` is an EntityField object from a MemberJunction entity with ExtendedType of "email".

### Web Link Directive

The web link directive converts text into an external URL link when the field has an extended type of "url".

```html
<span [mjWebLink]="field">{{ field.Value }}</span>
```

Where `field` is an EntityField object from a MemberJunction entity with ExtendedType of "url".

### Field Link Directive

The field link directive creates a link to another entity record when the field is a foreign key to another entity.

```html
<span [mjFieldLink]="true" [record]="customerRecord" [fieldName]="'AssignedUserID'">
  {{ customerRecord.Get('AssignedUserID') }}
</span>
```

This will display the AssignedUserID field value but link to the User entity record. The directive will attempt to replace the ID with the related entity's name when [replaceText]="true" is set.

## API Reference

### EmailLink Directive

| Input | Type | Description |
|-------|------|-------------|
| `field` | `EntityField` | The entity field object containing email data |

### WebLink Directive

| Input | Type | Description |
|-------|------|-------------|
| `field` | `EntityField` | The entity field object containing URL data |

### FieldLink Directive

| Input | Type | Default | Description |
|-------|------|---------|-------------|
| `record` | `BaseEntity` | (required) | The entity record object |
| `fieldName` | `string` | (required) | The name of the field that contains the foreign key |
| `replaceText` | `boolean` | `true` | Whether to replace the field value with the related entity's name |

## How It Works

### Base Link Class

All directives extend the BaseLink abstract class, which provides a common CreateLink method:

```typescript
protected CreateLink(el: ElementRef, field: EntityField, renderer: Renderer2, href: string, newTab: boolean = false) {
  // Creates an <a> element and wraps the original element
}
```

### Email Links

The EmailLink directive prepends "mailto:" to the field value and creates a link that opens the user's email client when clicked.

### Web Links

The WebLink directive uses the field value as the URL and creates a link that opens in a new tab when clicked.

### Field Links

The FieldLink directive:
1. Identifies the related entity from the field metadata
2. Gets the primary key of the related record
3. Creates a link to navigate to that record in the application
4. Optionally replaces the ID with the related record's name
5. Intercepts click events to handle navigation within the Angular app

## Styling

All links use the CSS class `link-text`, which you can style in your application:

```css
.link-text {
  color: #0066cc;
  text-decoration: underline;
  cursor: pointer;
}
```

## Dependencies

- @angular/common
- @angular/core
- @angular/router
- @memberjunction/core