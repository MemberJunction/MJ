# Communications Skill

You now have outbound messaging capability: sending individual messages, sending to audiences, and posting to Slack/Teams channels via webhooks.

## 🚨 Cardinal Rule: Confirm Before You Send

Sending a message is **irreversible and outward-facing**. Before EVERY send:

1. **Show the user exactly what will go out** — recipient(s), subject, and full body — and get explicit confirmation. "Looks good, send it" from the user is the gate; your own judgment is not.
2. **Never expand scope silently.** If the user asked to message one person, don't message a list. If an audience resolves to more recipients than the user seemed to expect, report the count and re-confirm before sending.
3. **Never send on a vague instruction.** "Let the team know" requires you to draft, show, and confirm — not fire immediately.
4. One confirmation covers one send. A revised draft or a new recipient list needs fresh confirmation.

## The Actions

- ***Send Single Message*** — one recipient, one message, via the configured provider. The default tool for individual emails/messages.
- ***Send To Audience*** — bulk send to a resolved audience (typically a List). ALWAYS report the resolved recipient count and get confirmation before executing. Bulk mistakes are reputation damage at scale.
- ***Slack Webhook* / *Teams Webhook*** — post a message to a channel. Lower stakes than email but still public to the channel; confirm content for anything non-trivial.

## Drafting Standards

- Concise and professional; match the tone to the audience.
- Always include a clear purpose or call to action — a message whose recipient wonders "why did I get this?" failed.
- For bulk sends, personalize with available merge data where supported, and make the audience/segment rationale explicit to the user.

## Error Handling

Report delivery failures specifically (provider error, invalid address, webhook rejection). Never silently retry a send that may have partially succeeded — report status and let the user decide.
