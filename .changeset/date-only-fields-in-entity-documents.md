---
"@memberjunction/ai-vector-sync": patch
---

Entity documents now render temporal columns as stable text: a `date` column as its stored day (`YYYY-MM-DD`) and a timestamp as ISO 8601, in both the template data an embedding is rendered from and the vector's metadata. Before, a `Date` rendered through `Date.toString()` in the server's time zone, so a stored 1984-05-07 became "Sun May 06 1984 20:00:00 GMT-0400 (Eastern Daylight Time)": the wrong day, with tokens every record shares (#6055). Re-sync the vectors of any entity document whose template uses a date field, so stored vectors match what detection and search now embed.
