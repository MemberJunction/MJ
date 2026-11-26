# @memberjunction/ng-avatar-studio

Generic Angular widgets package (`mjUILayer: "widgets"`) providing a reusable 3-tab Avatar Studio (`AI Generate + Iterative Refine`, `Icons`, and `Upload / URL`), a clickable `<mj-avatar-picker-trigger>` button, and `AvatarGeneratorService` for generating, refining, and downscaling avatars to `128×128` WebP (`0.85` quality) via MemberJunction's `Generate Image` action (`048FF309-C2CD-44D8-8A8E-8C771ADA8284`).

## Exports

- **`MjAvatarStudioComponent`** (`<mj-avatar-studio>`): Full 3-tab avatar editor with style presets, host-extensible `[PromptBuilder]`, iterative refinement + quick chips, curated icon tiles, optional `<mj-icon-picker>` full Font Awesome search, optional accent color swatches, upload/URL input, 10-step undo history, and `128×128 WebP · X.X KB` status badge.
- **`MjAvatarPickerTriggerComponent`** (`<mj-avatar-picker-trigger>`): Clickable avatar preview button (circle or rounded square) with an `Edit` badge to launch the studio.
- **`AvatarGeneratorService`**: Injectable service exposing `GenerateAvatar`, `RefineAvatar`, `ProcessUploadedFile`, `DownscaleToWebPDataUrl`, `BuildSourceImageForEdit`, and `ResolveGenerateImageActionId`.
- **`AvatarStudioModule`**: Convenience NgModule exporting both standalone components.

## Usage

```html
<mj-avatar-picker-trigger
  [ImageUrl]="logoUrl"
  [IconClass]="iconClass"
  [AccentColor]="accentColor"
  [AltText]="name"
  [IsOpen]="studioOpen"
  (TriggerClick)="studioOpen = !studioOpen">
</mj-avatar-picker-trigger>

@if (studioOpen) {
  <mj-avatar-studio
    [Provider]="Provider"
    [ImageUrl]="logoUrl"
    [IconClass]="iconClass"
    [AccentColor]="accentColor"
    [SubjectName]="name"
    [SubjectSubtitle]="subtitle"
    [PromptBuilder]="buildAvatarPrompt"
    [ShowAccentColorPicker]="true"
    (AvatarChange)="onAvatarChanged($event)">
  </mj-avatar-studio>
}
```
