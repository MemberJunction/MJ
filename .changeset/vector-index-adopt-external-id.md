---
"@memberjunction/core-entities-server": patch
---

A new Vector Index record that already has `ExternalID` set now adopts that provider index instead of creating one. Before, `MJVectorIndexEntityServer` always created an index named from `Name` and overwrote `ExternalID` with it, so pushing an app's shipped index row (More Cheese's `morecheese-duplicates`) made an empty provider index and pointed the row at it. The row records `provisionState: "adopted"`, and deleting an adopted row leaves the provider index in place, since MJ never created it.
