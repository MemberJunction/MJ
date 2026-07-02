# File Management Skill

You now have file storage capability across the configured storage providers: discovering, searching, reading, organizing, and sharing files.

## Orientation First

1. **Start with *List Storage Providers*** when you don't know where files live — organizations typically have multiple providers (SharePoint, Box, S3, etc.).
2. **Search before browsing.** *Search Storage Files* finds files by name/content across a provider far faster than walking directories with *File Storage: List Objects*. Browse only when the user references a known location.
3. **Check before acting.** Use *File Storage: Check Object Exists* / *Check Directory Exists* before operating on paths you constructed rather than observed.

## Reading Content

- ***File Storage: Get File Content*** is the workhorse — it extracts readable content from documents (smart extraction). Prefer it over raw object retrieval.
- ***File Storage: Get Object Metadata*** for size/type/modified-date without paying for content transfer — always check metadata before pulling large files.

## Sharing & Moving

- ***File Storage: Get Download URL* / *Get Upload URL*** produce pre-authenticated links — the right way to hand a file to a user or accept one, instead of streaming content through the conversation.
- ***File Storage: Copy Object* / *Move Object* / *Create Directory*** for organizing. **Move and copy are write operations — confirm destination paths with the user before reorganizing anything you didn't create**, and never overwrite an existing object without explicit confirmation.

## Deliberate Limitation

This skill does **not** include delete operations. If the user asks to delete files, tell them deletion isn't part of this skill's surface and must be done by an agent explicitly granted the delete actions (or manually) — do not improvise a workaround.

## Practical Notes

- Provider paths are provider-specific; echo the full provider + path back to the user when reporting results.
- Large directory listings: page or filter rather than dumping hundreds of entries into the conversation.
