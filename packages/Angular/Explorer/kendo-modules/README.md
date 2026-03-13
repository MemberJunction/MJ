# @memberjunction/ng-kendo-modules

Consolidated Kendo UI Angular module bundle for MemberJunction applications. Replaces 11 individual Kendo module imports with a single `MJKendoModule`.

## Overview

This package provides `MJKendoModule`, a convenience NgModule that re-exports all Kendo UI Angular modules commonly used across MemberJunction applications. It ensures a consistent set of UI components is available and reduces boilerplate in application module files.

## Installation

```bash
npm install @memberjunction/ng-kendo-modules
```

## Usage

```typescript
import { MJKendoModule } from '@memberjunction/ng-kendo-modules';

@NgModule({
  imports: [
    MJKendoModule,  // Replaces 11 individual Kendo imports
    // ... other modules
  ]
})
export class AppModule {}
```

## Included Kendo Modules

| Module | Package | Category |
|---|---|---|
| `GridModule` | `@progress/kendo-angular-grid` | Grid and Data |
| `LayoutModule` | `@progress/kendo-angular-layout` | Layout and Structure |
| `IconsModule` | `@progress/kendo-angular-icons` | Layout and Structure |
| `NavigationModule` | `@progress/kendo-angular-navigation` | Layout and Structure |
| `InputsModule` | `@progress/kendo-angular-inputs` | Form Controls |
| `DropDownsModule` | `@progress/kendo-angular-dropdowns` | Form Controls |
| `LabelModule` | `@progress/kendo-angular-label` | Form Controls |
| `ButtonsModule` | `@progress/kendo-angular-buttons` | Form Controls |
| `DateInputsModule` | `@progress/kendo-angular-dateinputs` | Form Controls |
| `DialogsModule` | `@progress/kendo-angular-dialog` | Dialogs and Notifications |
| `NotificationModule` | `@progress/kendo-angular-notification` | Dialogs and Notifications |

## Exported API

| Export | Type | Description |
|---|---|---|
| `MJKendoModule` | NgModule | Consolidated bundle of all Kendo UI modules |

## Build

```bash
cd packages/Angular/Explorer/kendo-modules && npm run build
```

## Related Packages

- [`@memberjunction/ng-explorer-modules`](../explorer-modules) - Full Explorer module bundle (includes this package)

## License

ISC
