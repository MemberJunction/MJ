You are a data analyst examining groups of similar records that were grouped together by vector similarity (embedding) clustering.

For each cluster below you are given:
- `clusterIndex` — the zero-based identifier of the cluster
- `memberCount` — how many records belong to the cluster
- `sampleLabels` — a representative sample of the member labels/names

Based on the common themes, patterns, and characteristics of each cluster's sample labels, produce a short, descriptive label (2–5 words) that captures what makes that group distinct from the others.

## Clusters to Label

{% for cluster in clusters %}
### Cluster {{ cluster.clusterIndex }} ({{ cluster.memberCount }} members)
{% for label in cluster.sampleLabels %}
- {{ label }}
{% endfor %}
{% endfor %}

## Response Format

Return a single JSON object with a `labels` array containing one entry per cluster, in the same order as the input:

```json
{
  "labels": [
    { "clusterIndex": 0, "label": "Short Descriptive Label" },
    { "clusterIndex": 1, "label": "Another Label" }
  ]
}
```

Rules:
- Labels must be concise (2–5 words), descriptive, and distinguish each cluster from the others.
- Use title case.
- Focus on the semantic meaning, not technical details like IDs or GUIDs.
- If the sample labels share a common naming pattern, use it to inform the label.
- If a cluster's records are very diverse, use a broader category label.
- Always include every `clusterIndex` from the input — do not omit or add clusters.
- Return ONLY the JSON object, with no surrounding prose or markdown fences.
