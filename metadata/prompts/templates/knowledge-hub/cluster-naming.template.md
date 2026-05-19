You are a data analyst examining groups of similar records that were clustered together by vector similarity.

For each cluster below, I'll provide sample records (metadata from the vector database). Based on the common themes, patterns, and characteristics of the records in each cluster, suggest a short, descriptive label (2-5 words) that captures what makes this group distinct.

## Clusters to Label

{{ clusterData }}

## Response Format

Return a JSON array with one object per cluster, in the same order as the input:

```json
[
  { "clusterId": 0, "label": "Short Descriptive Label" },
  { "clusterId": 1, "label": "Another Label" }
]
```

Rules:
- Labels should be concise (2-5 words), descriptive, and distinguish each cluster from the others
- Use title case
- Focus on the semantic meaning, not technical details like IDs
- If records have a Name field, use the common pattern in names to inform the label
- If a cluster's records are very diverse, use a broader category label
