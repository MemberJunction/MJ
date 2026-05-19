# DBAutoDoc Paper — LaTeX Source

The authoritative version of the paper is maintained in Overleaf.
These files are the local source for uploading to the Overleaf project.

## Files

- `main.tex` — Full paper in PVLDB (acmart/sigconf) format
- `references.bib` — BibTeX references (38 entries)

## Uploading to Overleaf

1. Open your Overleaf project (PVLDB template)
2. Replace the template's main `.tex` file content with `main.tex`
3. Upload `references.bib` to the project root
4. Compile with pdflatex + bibtex

## Target Venue

Primary: PVLDB Volume 19 (VLDB 2026/2027) — rolling monthly deadlines.
Fallback cascade: SIGMOD 2027, CIKM 2026, ICDE 2027.

## Notes

- The paper uses the `acmart` document class with `sigconf` format
- If the Overleaf PVLDB template uses `vldb.cls` instead, the content
  sections transfer directly — only the preamble/class declaration changes
- Mermaid diagrams from the MD version need to be converted to
  PDF/TikZ figures for the final submission (currently omitted)
