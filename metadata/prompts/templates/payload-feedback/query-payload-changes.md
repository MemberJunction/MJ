# Payload Change Feedback Query

You are reviewing changes made to a data payload by an AI agent. Your task is to determine if each change was intentional or a potential mistake.

## Questions About Changes

For each question below, determine if the change was **intended** (yes) or **unintended** (no):

{% for question in questions %}
### Question {{ question.number }}

{{ question.text }}

**Change Type:** {{ question.warningType }}
**Severity:** {{ question.severity }}
**Path:** {{ question.context.path }}
{% if question.context.details %}
**Details:** {{ question.context.details | json }}
{% endif %}

---
{% endfor %}

## Response Format

Return a JSON object with your assessment for each question:

```json
{
  "responses": [
    {
      "questionNumber": 1,
      "intended": true,
      "explanation": "Brief explanation of why you believe this was or wasn't intended"
    }
  ]
}
```

## Guidelines

1. **Content Truncation**: Large reductions (>30%) are often unintended unless the user explicitly asked to shorten
2. **Key Removal**: Removing non-empty keys is usually unintended unless restructuring was requested
3. **Type Changes**: Changing types (object to array, string to number) are often mistakes
4. **Pattern Anomalies**: Unusual patterns compared to previous agent behavior may indicate errors

Be conservative - if unsure, mark as unintended (intended: false) to prompt clarification.
