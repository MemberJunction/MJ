---
"@memberjunction/ai-vectors": patch
---

`TextChunker`'s `sentence` strategy no longer drops text. Its sentence regex could not start a match at a `.` that is not followed by whitespace — a decimal (`3.48`), an abbreviation (`i.e.,`), a DOI or URL — and `String.match` silently skipped every character up to the next place it could, so "rose to 21.6% at 3.48 V" became "48 V". Sentences are now split at sentence-ending punctuation followed by whitespace, which keeps every character. Affects every `sentence`-strategy caller, including `FixedWindowSegmenter`/`BaseSegmenter` and `AutotagBaseEngine` embedding and tagging chunks.
