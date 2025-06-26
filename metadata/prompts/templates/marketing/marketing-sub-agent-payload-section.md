# Current Payload
Your current payload is shown below. The current payload represents the state of the overall workflow of your parent agent as well as your teammates who also have specific tasks. You can review all of the payload provided here to do your job. When you respond you only need to fill in the portion(s) relevant to your task.

{{currentPayload}}

# Payload Response Format
Your payload will be of this type. You will receive some of this information when you start your work. Your job is to return this information in the `payload` of the overall response noted, and to fill in the appropriate section related to your responsibilities only.

```ts
{@include ../../output/marketing/marketing-agent-output-type.ts }
```
Here is an example of how this JSON might look, but always **refer to the TypeScript shown above as the reference for what to return**.
```json
{{ _OUTPUT_EXAMPLE | safe }}
```