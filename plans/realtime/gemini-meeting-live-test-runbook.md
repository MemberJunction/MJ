# Gemini Meeting-Mode — Live Test Runbook

**Validates §4** (`realtime-session-lifecycle-and-followups.md`): a Gemini-Live agent in a multi-agent room
runs with `automaticActivityDetection.disabled=true` and is driven by **manual** `activityStart`/`activityEnd`
turns — so it **hears everything, stays quiet until addressed, and responds when named.** This is the one
mechanism that's unit-tested at the send-shape level but unvalidated against the live Gemini API.

The three failure modes this test distinguishes:
| Symptom | Means |
|---|---|
| Gemini **blurts on every utterance** (spiral) | `automaticActivityDetection.disabled` didn't take — auto-response still on |
| Gemini **never responds**, even when named | `activityEnd` (from `RequestSpokenUpdate`) isn't committing the turn |
| Gemini **doesn't hear** (no transcript, no reaction when named) | audio isn't committed without a proper `activityStart` window |

---

## 0. Prereqs

```bash
# Local LiveKit server (the realtime bridge connects here)
lsof -iTCP:7880 -sTCP:LISTEN >/dev/null && echo "LiveKit UP" || \
  livekit-server --config docker/livekit/livekit.yaml &   # leave running

# MJAPI must be running the CURRENT branch build (restart so §4 + the rest is live)
cd packages/MJAPI && npm run start    # (separate terminal) — wait for "listening"
cd packages/MJExplorer && npm run start   # (separate terminal) — open the room UI
```

You also need an **Active Gemini realtime model** (`AIModelType='Realtime'`, an Active Gemini vendor with a
resolvable key, `DriverClass='GeminiRealtime'`) and an agent that uses it. Confirm with the picker or:

```sql
SELECT m.Name, v.Name AS Vendor, mv.DriverClass, mv.Status
FROM __mj.AIModel m
JOIN __mj.AIModelVendor mv ON mv.ModelID=m.ID
JOIN __mj.AIVendor v ON v.ID=mv.VendorID
WHERE m.AIModelType='Realtime' AND mv.DriverClass='GeminiRealtime';
```

---

## 1. The scenario — Gemini as the **second** agent

Gemini reports `CanReconfigureTurnMode=false`, so a Gemini agent that joins **first** can't be re-gated and
stays 1:1. To exercise meeting mode it must join a room that **already has an agent** (then it's *born* in
meeting mode — `disableAutoResponse` set at connect):

1. Open a LiveKit room in MJExplorer (the Meet surface / the realtime widget).
2. **Add Agent 1** — any agent (e.g. an OpenAI-model agent like Sage). Talk to it normally; confirm it answers.
3. **Add Agent 2 — the Gemini agent.** Pick the Gemini realtime model in the dev model picker.
4. Now **talk**, and run these checks:

| Step | Expected (PASS) |
|---|---|
| Say something **not** addressed to the Gemini agent ("Sage, what's the weather?") | The Gemini agent **stays silent**; only Sage responds. |
| Say the **Gemini agent's name** ("⟨Gemini agent name⟩, summarize that") | The Gemini agent **responds once**, on point. |
| Keep chatting between you + Sage | The Gemini agent **keeps listening, doesn't blurt** — and its later replies show it **heard** the prior context. |

If the Gemini agent talks over everything → failure mode 1. If it never replies even when named → mode 2. If
it replies but clearly didn't hear the conversation → mode 3.

---

## 2. Verify in the DB (after the run)

```bash
node --input-type=module -e "
import 'dotenv/config'; import sql from 'mssql';
const cfg={server:process.env.DB_HOST,port:+(process.env.DB_PORT||1433),user:process.env.DB_USERNAME,password:process.env.DB_PASSWORD,database:process.env.DB_DATABASE,options:{encrypt:false,trustServerCertificate:true}};
const pool=await sql.connect(cfg);
// Latest bridge sessions (both agents should be Passive/Connected)
const br=await pool.request().query(\`SELECT TOP 5 LEFT(b.ID,8) Bridge, b.Status, b.TurnMode, CONVERT(varchar,b.ConnectedAt,121) Connected, agt.Name Agent FROM __mj.AIAgentSessionBridge b LEFT JOIN __mj.AIAgentSession s ON s.ID=b.AgentSessionID LEFT JOIN __mj.AIAgent agt ON agt.ID=s.AgentID ORDER BY b.ConnectedAt DESC\`);
console.log('Bridges:'); console.dir(br.recordset,{depth:null});
// The room transcript — diarized: each line should be attributed (ExternalID set on User lines)
const tx=await pool.request().query(\`SELECT TOP 20 cd.Role, LEFT(cd.Message,60) Message, LEFT(cd.ExternalID,18) Speaker FROM __mj.ConversationDetail cd JOIN __mj.Conversation c ON c.ID=cd.ConversationID WHERE c.Type='Meeting Room' ORDER BY cd.__mj_CreatedAt DESC\`);
console.log('\\nRecent transcript lines (newest first):'); console.dir(tx.recordset,{depth:null});
await pool.close();
" 2>&1 | tail -40
```

**PASS signals in the data:**
- Both agents have a `Connected`, `Passive` bridge.
- The **transcript captured the conversation** (a `Meeting Room` conversation with `ConversationDetail`
  rows for what was said) — proves Gemini **heard** (mode 3 ruled out).
- `User` lines carry a `Speaker` (`ExternalID`) — diarization is attributing.
- The Gemini agent's `AI` lines appear only after it was addressed, not on every turn (mode 1 ruled out).

You can also watch the **MJAPI log** during the run for the bridge diagnostics: `FIRST inbound media frame
reached the agent` (it's hearing), `turn decision=Speak/Silent` (the gate firing), and — when you name it —
the agent producing one clean response.

---

## 3. If it fails

- **Mode 1 (blurts):** confirm the Gemini session actually got `disableAutoResponse`. It's set only when the
  agent joins meeting mode (2nd into the room). If you added Gemini **first**, it's 1:1 by design — add it
  second. If it's genuinely 2nd and still blurts, `automaticActivityDetection.disabled` isn't taking — check
  `geminiRealtime.ts buildConnectConfig` against the current `@google/genai` `LiveConnectConfig` shape.
- **Mode 2 (silent):** the `RequestSpokenUpdate → activityEnd` commit isn't eliciting a response. Check
  whether Gemini needs `activityStart` **and** content before `activityEnd` will generate — the manual-
  activity contract in `GeminiRealtimeSession.SendInput`/`RequestSpokenUpdate` may need a tweak.
- **Mode 3 (deaf):** audio isn't being accepted in manual-activity mode — the `activityStart` window may
  need to open before the first audio chunk reaches the model (it does today, but verify the ordering).

Record the outcome in §4 of `realtime-session-lifecycle-and-followups.md` (flip "pending live validation" to
✅, or note the specific failure mode + the fix).
