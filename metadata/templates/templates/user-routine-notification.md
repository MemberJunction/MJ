{% if status == 'Success' %}✅{% else %}⚠️{% endif %} **{{ routine.Name }}** — {{ status }}

{% if resultSummary %}{{ resultSummary }}{% else %}The routine run completed with no summary.{% endif %}

{% if run.ErrorMessage %}> **Error:** {{ run.ErrorMessage }}{% endif %}
