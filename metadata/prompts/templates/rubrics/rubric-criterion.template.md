### {{ Criterion.Name | safe }} (`{{ Criterion.Key }}`)
{% if Criterion.IsGate %}
This criterion is a gate: a low score here fails the whole evaluation.
{% endif %}{% if Criterion.Description %}
{{ Criterion.Description | safe }}
{% endif %}{% if Criterion.Guidance %}
Guidance: {{ Criterion.Guidance | safe }}
{% endif %}{% if Criterion.Hints %}
Hints: {{ Criterion.Hints | safe }}
{% endif %}{% if Criterion.RequireQuote %}
Quote the subject as evidence for this criterion.
{% endif %}
{% if Criterion.NotApplicablePolicy == 'NotAllowed' %}Not applicable is not allowed: choose a level.{% elif Criterion.NotApplicablePolicy == 'CountAsZero' %}Not applicable is allowed and counts as the lowest score.{% elif Criterion.NotApplicablePolicy == 'FailEvaluation' %}Not applicable is allowed, and it fails the evaluation.{% else %}Not applicable is allowed: the criterion is then left out and its weight goes to the others.{% endif %}
{% if Criterion.Scale and Criterion.Scale.Type == 'Numeric' %}
Score with a number from {{ Criterion.Scale.Min }} to {{ Criterion.Scale.Max }}{% if Criterion.Scale.Step %}, in steps of {{ Criterion.Scale.Step }}{% endif %}. {% if Criterion.Scale.HigherIsBetter %}Higher{% else %}Lower{% endif %} is better.
{% else %}
Levels, lowest to highest:
{% for level in Criterion.Levels %}
- **{{ level.Label | safe }}**{% if level.Anchor %}: {{ level.Anchor | safe }}{% endif %}{% endfor %}
{% endif %}
