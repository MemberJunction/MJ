# @memberjunction/ng-link-directives

The `@memberjunction/ng-link-directives` package provides a set of Angular directives that transform text elements into different types of links based on MemberJunction entity field metadata. This makes it easy to display email addresses, URLs, and entity relationships as clickable links in your application.

## Features

- **Email link directive** (`mjEmailLink`) - Converts fields with "email" extended type to mailto: links
- **Web link directive** (`mjWebLink`) - Converts fields with "url" extended type to external links
- **Field link directive** (`mjFieldLink`) - Creates navigable links to related entity records
- **Automatic value resolution** - Field links can display the related entity's name instead of ID
- **Smart navigation** - Field links use Angular Router for seamless in-app navigation
- **Target control** - Web and email links open in new tabs by default
- **CSS styling** - All links use the `link-text` class for consistent styling
- **Type safety** - Full TypeScript support with strict typing
- **Metadata integration** - Leverages MemberJunction's metadata system for field information

## Installation

```bash
npm install @memberjunction/ng-link-directives
```

## Requirements

- Angular 21 or higher
- @memberjunction/core 2.43.0 or higher
- TypeScript 4.0 or higher

## Usage

### Basic Setup

Import the LinkDirectivesModule in your Angular module:

```typescript
import { NgModule } from '@angular/core';
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

```typescript
// In your component
import { EntityField } from '@memberjunction/core';

export class YourComponent {
  field: EntityField; // EntityField with ExtendedType = "email"
}
```

**Note**: The directive will log an error if the field's ExtendedType is not "email". There is a known issue where the error message incorrectly references "mjWebLink" instead of "mjEmailLink".

### Web Link Directive

The web link directive converts text into an external URL link when the field has an extended type of "url".

```html
<span [mjWebLink]="field">{{ field.Value }}</span>
```

```typescript
// In your component
import { EntityField } from '@memberjunction/core';

export class YourComponent {
  field: EntityField; // EntityField with ExtendedType = "url"
}
```

**Note**: The directive will log an error if the field's ExtendedType is not "url". Links open in a new tab by default.

### Field Link Directive

The field link directive creates a link to another entity record when the field is a foreign key to another entity.

```html
<!-- Basic usage -->
<span [mjFieldLink]="true" [record]="customerRecord" [fieldName]="'AssignedUserID'">
  {{ customerRecord.Get('AssignedUserID') }}
</span>

<!-- With text replacement disabled -->
<span [mjFieldLink]="true" [record]="customerRecord" [fieldName]="'AssignedUserID'" [replaceText]="false">
  {{ customerRecord.Get('AssignedUserID') }}
</span>
```

```typescript
// In your component
import { BaseEntity } from '@memberjunction/core';

export class YourComponent {
  customerRecord: BaseEntity; // Entity record containing the foreign key field
}
```

The directive:
- Navigates to `/resource/record/{primaryKey}?Entity={EntityName}` when clicked
- Automatically replaces the ID with the related entity's name (when `replaceText=true`)
- Uses `RelatedEntityNameFieldMap` metadata for efficient name resolution
- Falls back to server lookup if name mapping is not available

## API Reference

### EmailLink Directive

**Selector**: `[mjEmailLink]`

| Input | Type | Required | Description |
|-------|------|----------|-------------|
| `field` | `EntityField` | Yes | The entity field object containing email data. Must have ExtendedType = "email" |

### WebLink Directive

**Selector**: `[mjWebLink]`

| Input | Type | Required | Description |
|-------|------|----------|-------------|
| `field` | `EntityField` | Yes | The entity field object containing URL data. Must have ExtendedType = "url" |

### FieldLink Directive

**Selector**: `[mjFieldLink]`

| Input | Type | Default | Required | Description |
|-------|------|---------|----------|-------------|
| `mjFieldLink` | `boolean` | - | Yes | Enable the directive (must be set to true) |
| `record` | `BaseEntity` | - | Yes | The entity record object containing the field |
| `fieldName` | `string` | - | Yes | The name of the field that contains the foreign key |
| `replaceText` | `boolean` | `true` | No | Whether to replace the field value with the related entity's name |

**Events**: The directive handles click events internally to navigate using Angular Router.

## Implementation Details

### Base Link Class

All directives extend the `BaseLink` abstract class, which provides a common `CreateLink` method:

```typescript
protected CreateLink(
  el: ElementRef, 
  field: EntityField, 
  renderer: Renderer2, 
  href: string, 
  newTab: boolean = false
): void
```

This method:
- Creates an `<a>` element using Angular's Renderer2
- Wraps the original element with the link
- Adds the `link-text` CSS class
- Sets `target="_blank"` for new tab behavior

### Email Links

The `EmailLink` directive:
1. Validates that the field has ExtendedType = "email"
2. Prepends "mailto:" to the field value
3. Creates a link that opens the user's default email client
4. Always opens in a new tab

### Web Links

The `WebLink` directive:
1. Validates that the field has ExtendedType = "url"
2. Uses the field value directly as the href
3. Creates an external link that opens in a new tab
4. Logs an error if the ExtendedType validation fails

### Field Links

The `FieldLink` directive provides the most complex functionality:

1. **Metadata Resolution**: Uses MemberJunction's metadata to find the related entity
2. **Navigation Setup**: Constructs the route as `/resource/record/{primaryKey}?Entity={EntityName}`
3. **Name Resolution**: 
   - First checks `RelatedEntityNameFieldMap` for local field mapping
   - Falls back to `GetEntityRecordName()` API call if needed
4. **Click Handling**: Intercepts clicks and uses Angular Router for navigation
5. **Error Handling**: Includes navigation event monitoring for debugging

**Note**: Currently supports only single-value primary keys for foreign key relationships.

## Styling

All generated links include the CSS class `link-text` for consistent styling across your application:

```css
.link-text {
  color: #0066cc;
  text-decoration: underline;
  cursor: pointer;
}

.link-text:hover {
  color: #0052a3;
  text-decoration: none;
}

.link-text:visited {
  color: #551a8b;
}
```

## Complete Example

Here's a complete example showing all three directives in action:

```typescript
// component.ts
import { Component, OnInit } from '@angular/core';
import { BaseEntity, Metadata } from '@memberjunction/core';

@Component({
  selector: 'app-contact-details',
  template: `
    <div class="contact-info">
      <!-- Email link -->
      <div>
        Email: <span [mjEmailLink]="emailField">{{ contact.Get('Email') }}</span>
      </div>
      
      <!-- Web link -->
      <div>
        Website: <span [mjWebLink]="websiteField">{{ contact.Get('Website') }}</span>
      </div>
      
      <!-- Field link with name replacement -->
      <div>
        Account Manager: 
        <span [mjFieldLink]="true" [record]="contact" [fieldName]="'AccountManagerID'">
          {{ contact.Get('AccountManagerID') }}
        </span>
      </div>
    </div>
  `
})
export class ContactDetailsComponent implements OnInit {
  contact: BaseEntity;
  
  get emailField() {
    return this.contact.Fields.find(f => f.Name === 'Email');
  }
  
  get websiteField() {
    return this.contact.Fields.find(f => f.Name === 'Website');
  }
  
  async ngOnInit() {
    const md = new Metadata();
    this.contact = await md.GetEntityObject('Contacts');
    await this.contact.Load(123); // Load specific contact
  }
}
```

## Build and Development

This package uses the Angular CLI compiler (`ngc`) for building:

```bash
# Build the package
npm run build

# The compiled output will be in the ./dist directory
```

The package is configured with:
- TypeScript strict mode
- ES2015 target with ES2020 modules
- Source maps and declaration files
- Angular compiler optimizations

## Integration with MemberJunction

This package is designed to work seamlessly with the MemberJunction framework:

- **Metadata Integration**: Leverages EntityField metadata for field type detection
- **Navigation**: Integrates with MJ's standard routing patterns (`/resource/record/...`)
- **Entity System**: Works with BaseEntity and EntityField objects
- **Name Resolution**: Uses MJ's entity relationship mapping for efficient data display

## Troubleshooting

### Common Issues

1. **"Entity Field must have ExtendedType of URL"** - Ensure your entity field metadata has the correct ExtendedType set
2. **Links not appearing** - Verify the directive is properly applied and the field has a value
3. **Navigation errors** - Check that the related entity exists in metadata and the route is configured

### Debugging Tips

- The FieldLink directive logs navigation events to the console
- Use browser DevTools to inspect the generated link structure
- Check that RelatedEntity metadata is properly configured for field links

## License

ISC

## Dependencies

- **Runtime Dependencies:**
  - @memberjunction/core: ^2.43.0
  - tslib: ^2.3.0

- **Peer Dependencies:**
  - @angular/common: ^18.0.2
  - @angular/core: ^18.0.2
  - @angular/router: ^18.0.2

- **Development Dependencies:**
  - @angular/compiler: ^18.0.2
  - @angular/compiler-cli: ^18.0.2