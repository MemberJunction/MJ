# Custom Agent Icons Guide

## Overview

MemberJunction agents support flexible icon customization through two complementary approaches:

1. **CSS Classes** - For developers who control CSS (version controlled, performant)
2. **Logo URLs** - For end users and external images (uploaded/hosted images)

This dual approach ensures that:
- **MJ Core Developers** can create custom CSS-based icons
- **3rd Party Developers** can add icons via their own CSS or image URLs
- **End Users** can upload custom agent logos without touching code

## Icon Resolution Priority

The UI renders icons using this priority:

1. **LogoURL** (if provided) - Image from URL or data URI
2. **IconClass** (fallback) - CSS class (Font Awesome or custom)
3. **Default** (last resort) - `fa-robot` icon

## Approach 1: CSS Class Icons (Recommended for Developers)

### For MJ Core Developers

Edit `packages/Angular/generic/conversations/src/lib/styles/custom-agent-icons.css`:

```css
/* Add your custom icon */
.mj-icon-my-agent {
  width: 1em;
  height: 1em;
  display: inline-block;
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
  background-image: url('data:image/svg+xml;utf8,<svg>...</svg>');
  vertical-align: middle;
}
```

Then reference it in agent metadata:

```json
{
  "fields": {
    "Name": "My Agent",
    "IconClass": "mj-icon-my-agent"
  }
}
```

### For 3rd Party Developers

Add your own CSS file to your application (globally loaded):

```css
/* In your-app-styles.css */
.acme-icon-analyzer {
  width: 1em;
  height: 1em;
  display: inline-block;
  background-image: url('/assets/icons/analyzer.svg');
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
}
```

Reference your class in agent metadata:

```json
{
  "fields": {
    "Name": "Acme Analyzer",
    "IconClass": "acme-icon-analyzer"
  }
}
```

**Key Point**: As long as your CSS is loaded by the application, any class name will work. You don't need to modify MJ source code.

### CSS Icon Techniques

#### 1. Emoji (Simplest)
```css
.mj-icon-brain::before {
  content: "🧠";
  font-size: 1.2em;
}
```

#### 2. Unicode Symbol
```css
.mj-icon-lightning::before {
  content: "\26A1";  /* ⚡ */
  font-size: 1.2em;
}
```

#### 3. Text/Monogram
```css
.mj-icon-s::before {
  content: "S";
  font-weight: 800;
  font-size: 1.1em;
  color: #667eea;
}
```

#### 4. Gradient Text
```css
.mj-icon-gradient::before {
  content: "⚡";
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
```

#### 5. SVG Data URI (Most Control)
```css
.mj-icon-custom {
  width: 1em;
  height: 1em;
  display: inline-block;
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
  background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23667eea"><path d="M12 2..."/></svg>');
  vertical-align: middle;
}
```

#### 6. External Image File
```css
.mj-icon-logo {
  width: 1em;
  height: 1em;
  display: inline-block;
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
  background-image: url('/assets/icons/my-logo.svg');
  vertical-align: middle;
}
```

## Approach 2: Logo URL (For End Users & Existing Assets)

Use the `LogoURL` field in agent metadata to reference hosted images:

### HTTP/HTTPS URLs
```json
{
  "fields": {
    "Name": "My Agent",
    "LogoURL": "https://example.com/agent-logo.png",
    "IconClass": "fa-robot"  // Fallback if URL fails
  }
}
```

### Data URIs (Embedded Images)
```json
{
  "fields": {
    "Name": "My Agent",
    "LogoURL": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA...",
    "IconClass": "fa-robot"  // Fallback
  }
}
```

### Relative Paths (Application Assets)
```json
{
  "fields": {
    "Name": "My Agent",
    "LogoURL": "/assets/agents/my-agent.svg",
    "IconClass": "fa-robot"  // Fallback
  }
}
```

## Using Font Awesome Icons

For standard icons, use Font Awesome classes directly:

```json
{
  "fields": {
    "Name": "My Agent",
    "IconClass": "fa-solid fa-robot"
  }
}
```

Browse icons at: https://fontawesome.com/icons

## Best Practices

### ✅ DO
- Use `mj-icon-*` prefix for MJ core icons
- Use your own prefix for 3rd party icons (e.g., `acme-icon-*`)
- Test icons at 16px, 24px, and 36px sizes
- Test in both light and dark themes
- Provide `IconClass` fallback when using `LogoURL`
- Document your custom icons in comments
- Use SVG format for scalable, crisp icons
- Keep data URIs under 10KB for performance

### ❌ DON'T
- Don't use generic class names (risk of conflicts)
- Don't use overly complex SVGs (keep paths simple)
- Don't use animations unless essential
- Don't use external URLs without fallback
- Don't use raster images (PNG/JPG) if vector (SVG) works
- Don't modify MJ's core CSS file for 3rd party icons

## Examples

### Example 1: Skip Brain Agent (MJ Core)
```css
/* In custom-agent-icons.css */
.mj-icon-skip {
  width: 1em;
  height: 1em;
  background-image: url('data:image/svg+xml;utf8,<svg>...</svg>');
  /* SVG with brain/intelligence icon */
}
```

```json
{
  "fields": {
    "Name": "Skip",
    "IconClass": "mj-icon-skip"
  }
}
```

### Example 2: 3rd Party Agent (Acme Corp)
```css
/* In acme-styles.css (loaded globally by your app) */
.acme-icon-analyzer {
  width: 1em;
  height: 1em;
  background-image: url('https://acme.com/icons/analyzer.svg');
}
```

```json
{
  "fields": {
    "Name": "Acme Analyzer",
    "IconClass": "acme-icon-analyzer"
  }
}
```

### Example 3: End User Uploaded Logo
```json
{
  "fields": {
    "Name": "Custom Agent",
    "LogoURL": "https://storage.example.com/uploads/agent-logo.png",
    "IconClass": "fa-robot"  // Fallback
  }
}
```

### Example 4: Simple Emoji Icon
```css
.company-icon-support::before {
  content: "🤝";
  font-size: 1.2em;
}
```

```json
{
  "fields": {
    "Name": "Support Agent",
    "IconClass": "company-icon-support"
  }
}
```

## Creating SVG Data URIs

### Online Tools
- [URL-encoder for SVG](https://yoksel.github.io/url-encoder/)
- [SVG to Data URI converter](https://heyallan.github.io/svg-to-data-uri/)

### Manual Approach
```bash
# 1. Create your SVG file (my-icon.svg)
# 2. Optimize it with SVGO
svgo my-icon.svg

# 3. URL encode it
# (or use online tool)

# 4. Embed in CSS
.my-icon {
  background-image: url('data:image/svg+xml;utf8,<svg>...</svg>');
}
```

### Tips for SVG Icons
- Use viewBox for proper scaling
- Minimize paths and remove unnecessary metadata
- Use relative units (no fixed width/height attributes)
- Test color encoding (use %23 for #)
- Keep total size under 5-10KB

## Debugging Icon Issues

### Icon Not Showing?

1. **Check CSS is loaded**: Inspect element, verify CSS file in Network tab
2. **Check class name**: Verify exact spelling/case in agent metadata
3. **Check console**: Look for 404 errors on URLs
4. **Test fallback**: Temporarily use `"IconClass": "fa-robot"` to verify system works
5. **Inspect computed styles**: Dev tools → element → computed styles

### Icon Wrong Size?

```css
/* Ensure proper sizing */
.my-icon {
  width: 1em;
  height: 1em;
  font-size: inherit;  /* Inherits from parent */
}
```

### Icon Not Centered?

```css
.my-icon {
  display: inline-block;
  vertical-align: middle;
  background-position: center;
}
```

## Performance Considerations

- **CSS Classes**: Near-zero overhead, cached with CSS
- **Data URIs**: Included in CSS bundle, no additional requests
- **External URLs**: Requires HTTP request, can be cached
- **Image Size**: Keep logos under 50KB, ideally under 10KB
- **Format**: SVG > PNG > JPG for icons

## Support Matrix

| Approach | MJ Core | 3rd Party | End Users | Version Control |
|----------|---------|-----------|-----------|-----------------|
| CSS Classes (mj-icon-*) | ✅ | ❌ | ❌ | ✅ |
| CSS Classes (custom prefix) | ❌ | ✅ | ❌ | ✅ |
| Font Awesome | ✅ | ✅ | ✅ | N/A |
| LogoURL (data URI) | ✅ | ✅ | ✅ | ✅ |
| LogoURL (external URL) | ❌ | ✅ | ✅ | ❌ |

## FAQs

**Q: Can I use both IconClass and LogoURL?**
A: Yes! LogoURL takes priority, IconClass is the fallback.

**Q: Do I need to modify MJ source code for 3rd party icons?**
A: No! Just add your CSS globally and reference your class names.

**Q: Can end users upload custom agent logos?**
A: Yes, via the LogoURL field (needs file upload UI implementation).

**Q: What happens if LogoURL fails to load?**
A: The system falls back to IconClass, then to default `fa-robot`.

**Q: Can I animate icons?**
A: Yes, but use sparingly. Add CSS animations to your custom classes.

**Q: How do I use my company's logo?**
A: Either embed via data URI or host it and use LogoURL field.

## Related Files

- **Icon CSS**: `packages/Angular/generic/conversations/src/lib/styles/custom-agent-icons.css`
- **Component**: `packages/Angular/generic/conversations/src/lib/components/message/message-item.component.ts`
- **Template**: `packages/Angular/generic/conversations/src/lib/components/message/message-item.component.html`
- **Entity**: `packages/MJCoreEntities/src/generated/entity_subclasses.ts` (AIAgentEntity)

## Contributing

To add new icons to MJ core:

1. Add CSS class to `custom-agent-icons.css`
2. Document in comments
3. Test at multiple sizes
4. Submit PR with examples

## License

MemberJunction custom icons system is part of the MJ platform and follows the same license terms.
