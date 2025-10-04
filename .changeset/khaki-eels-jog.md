---
"@memberjunction/ng-ai-test-harness": patch
"@memberjunction/core-actions": patch
---

Enhance Web Page Content action with comprehensive format support (resolves #1414)

**New Format Support**:

- JSON APIs, PDF, DOCX, XML, CSV, HTML, and images
- Intelligent content type detection from headers and file extensions
- New 'auto' mode for automatic format selection (default)

**Improvements**:

- Enhanced HTML to Markdown conversion (Turndown library)
- Robust HTML parsing with JSDOM
- Increased default MaxContentLength to 100,000 characters
- Fix '[object Object]' display in Prompt Runner UI
