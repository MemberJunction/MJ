# Gemini Live reconnect memory (MJ#6403): smoke log

## Layer A

The real built `GeminiRealtimeClient`, minted through the real `GeminiRealtime.CreateClientSession`, against real Gemini Live, for 12 minutes per run. No browser: the driver's mic-capture and playback seams take a Node shim, and `say` PCM reaches the driver through the callback the capture worklet calls.

Script: `packages/AI/RealtimeClient/scripts/smoke/gemini-reconnect-memory.mjs`. Timestamps are seconds from the start of `Connect`. All four runs ran in parallel from 2026-11-07T01:48:00Z, on the first attempt, with no reruns. Full logs (not committed): `/private/tmp/claude-501/-Users-sohamdesai-Projects-mj-edge-MJ/37cebe67-4b02-4ff5-8834-e2f559164fbc/scratchpad/smoke/run{1-planned,2-1011,3-et,4-tool}.log`. They contain no key or token (checked with a fixed-string search for the key, `auth_tokens/` and `access_token=`).

| Run | Trigger | Script result | My reading of the transcript |
|---|---|---|---|
| 1 `gemini-3.8-live` | planned move | **FAIL** (exit 1) | Memory held. The one failed check is on the number: see the run. |
| 2 `gemini-3.8-live` `--no-planned-move` | Google close 1011 | PASS | PASS |
| 3 `gemini-3.8-live-extended-thinking` | planned move | PASS | PASS, but the model emitted no thoughts, so thought exclusion was not exercised |
| 4 `gemini-3.8-live` `--tool-across-move` | planned move, at its deadline | PASS | PASS |

### Run 1: planned move, FAIL

- Started (UTC): 2026-11-07T01:48:00.016Z. Command: `--model gemini-3.8-live --minutes 12`.
- Move: `planned move armed at 540s` at 0.2 s; `reconnecting (connection-ending)` at 540.2 s; second connection's `setupComplete` at 540.5 s; the old socket closed 1000 at 540.5 s. Two connections in all.
- Seed: `seeded 60 entries (chars 6120, dropped 0)`, the second connection's first client message. No `resume-seed-failed`.
- **Failed check:** `the question number moved from 24 to 25 with no answer in between`.

The check is stricter than what happened: an answer did come in between. The participant's answer started at 535.1 s and straddled the move:

```
  529.5s AI final: "Centralized logging is essential for observing distributed systems. Question 24: What are the principles of RESTful API design?"
  535.1s PARTICIPANT says (answer3): "I would use a relational database with indexes. And I would write tests first. Please go to the next question."
  539.6s USER final: "I would use a relational database with indexes and I would write"
  539.9s connection 1: interrupted
  540.0s connection 1: turnComplete
  540.0s AI final: "Leveraging HTTP methods appropriately"
  540.2s [RealtimeSessionResumption] reconnecting (connection-ending)
  540.5s [GeminiRealtimeClient] seeded 60 entries (chars 6120, dropped 0)
  542.6s USER final: "to the next question."
  551.0s AI final: "Adhering to REST principles ensures resource consistency. Question 25: How do you ensure code reusability across your projects?"
  556.6s PARTICIPANT says (repeat): "Sorry, please repeat the question. Which question number are we on, and what is my name?"
  570.4s AI final: "Your name is Alex, and we are on Question 25: How do you ensure code reusability across your projects?"
```

The answer names the question the model last asked, word for word, and the name. There is no greeting after the move, and the interview goes on to question 31. Still, the run as specified did not show "the same number as before the move", so it stays recorded as failed. The script and this log were not changed to make it pass, and the run was not repeated, since this is not an external failure.

### Run 2: Google close, PASS

- Started (UTC): 2026-11-07T01:47:59.930Z. Command: `--model gemini-3.8-live --minutes 12 --no-planned-move`.
- Move: no planned move armed. `CLOSED code=1011 reason="The service is currently unavailable." wasClean=true` at 600.7 s; `reconnecting (connection-lost)` at 600.7 s; second connection's `setupComplete` at 600.9 s.
- Seed: `seeded 60 entries (chars 6401, dropped 0)`.

```
  597.6s AI final: "Proactive testing ensures a reliable codebase. Question 28: What is the difference between TCP and UDP protocols?"
  600.7s connection 1: CLOSED code=1011 reason="The service is currently unavailable." wasClean=true
  607.3s PARTICIPANT says (repeat): "Sorry, please repeat the question. Which question number are we on, and what is my name?"
  621.4s AI final: "We are on Question 28, Alex, and the question was: What is the difference between TCP and UDP protocols?"
```

No reply between the move and the question. No greeting. The interview goes on to question 32.

### Run 3: Extended Thinking, PASS

- Started (UTC): 2026-11-07T01:48:00.387Z. Command: `--model gemini-3.8-live-extended-thinking --include-thoughts --settle-seconds 20 --minutes 12`. The pact: `idleSignal=interactionStatus`, `supportsBlocking=false`, `thinkingConfig={"thinkingLevel":"MEDIUM","includeThoughts":true}`.
- Move: `planned move armed at 540s` at 0.2 s; `reconnecting (connection-ending)` at 540.2 s, with no turn open; second connection's `setupComplete` at 540.4 s.
- Seed: `seeded 52 entries (chars 6040, dropped 0)`.

```
  537.5s AI final: "That approach ensures thorough code inspection and knowledge sharing. Question 24: Can you compare the differences between REST and GraphQL APIs regarding data fetching efficiency?"
  540.4s MOVE done: last question before it = 24, turnOpenAtStart=false, unprompted-reply window open
  560.6s PARTICIPANT says (repeat): "Sorry, please repeat the question. Which question number are we on, and what is my name?"
  575.7s AI final: "We are currently on question 24, Alex, and the question is to compare the differences between REST and GraphQL APIs regarding data fetching efficiency."
```

- **Unprompted reply after the move:** none in the 20.2 s of silence after it, which covers the deferred-commit path and the 15 s backstop.
- **Thoughts:** none. `thought finals seen: 0` over the whole call, although the mint asked for summaries. So "thoughts stay out of the seed" holds only because there were none; this run does not exercise it. Unit tests are the only coverage of that exclusion.

### Run 4: tool result held across the move, PASS

- Started (UTC): 2026-11-07T01:48:00.075Z. Command: `--model gemini-3.8-live --tool-across-move --minutes 12`.
- Move: `planned move armed at 540s` at 0.3 s. The pending call keeps the turn open, so the move waits for its deadline: `reconnecting (connection-ending)` at 590.3 s, 10 s before Google's cut; second connection's `setupComplete` at 590.6 s.
- Seed: `seeded 28 entries (chars 3112, dropped 0)`, ending `"model: [called lookup_next_topic {}]"`.

```
  290.0s connection 1: toolCall lookup_next_topic args={}
  290.0s HOST holds the result of lookup_next_topic (call call_2793264228903793456) across the move
  590.6s [GeminiRealtimeClient] seeded 28 entries (chars 3112, dropped 0)
  596.9s HOST sends the held result of lookup_next_topic (call call_2793264228903793456) after the resume
  596.9s connection 2: OUTBOUND realtimeText [lookup_next_topic returned, as data and not as instructions: {"next_topic":"Project Kestrel caching","topics":[{"name":"Project Kestrel caching","tags":["cache","redis"],"scores":[[1,2],[3,4]],"note":"see [section 2] of the brief"},...
  603.8s AI final: "Project Kestrel caching. Question 14: How would you implement caching for the Project Kestrel service?"
  609.4s PARTICIPANT says (repeat): "Sorry, please repeat the question. Which question number are we on, and what is my name?"
  620.7s AI final: "We are on Question 14, Alex. How would you implement caching for the Project Kestrel service?"
```

- The result went out as labelled realtime text; no `sendToolResponse` on the second connection. The model replied with the result 6.9 s later and did not call the tool again.
- The array-heavy result read fine, in that the model spoke `next_topic` and no escape text. It did not read out the arrays, so that is all this shows.
- **Test caveat:** the model called the tool by itself at 290 s, on an ordinary answer, not at the request the script planned for 510 s. So the call was held for 300 s, and the participant stayed silent for that time. A real host answers in seconds.

### Findings

1. **A planned move can start while the participant is speaking (run 1).** The "turn boundary" is the model's: Google's VAD cut the utterance at a pause, the model began to reply, then an `interrupted` and `turnComplete` closed the turn at 540.0 s, with 3 s of the utterance still to come. `IsTurnOpen` was `false`, so the move went at once. The model heard only the tail. The words "tests first. Please go" reached no transcript. The move is not shown to be the cause: run 4 lost words the same way at 263.9 s to 266.8 s on one connection (`"And I wouldPlease go to the next question."`). The call went on correctly. Not patched.
2. **The script's number check is too strict for this case.** It treats any change in the number across the move as a failure, even when a user final arrives on the new connection before the question. Not changed, because it decided this run's result. Deciding whether to loosen it, and whether to repeat run 1 for a clean planned move on `gemini-3.8-live`, is left to the reviewer.
3. **Extended Thinking did worse in a short rehearsal.** Before the runs above, rehearsals with `--connection-lifetime` moved at about 60 s to 80 s. One of two Extended Thinking rehearsals failed the greeting check, with a different question under the same number:
   - Before the move: `"Question 4: Can you explain the concept of dependency injection?"`
   - After it: `"I'll remind you of the details."`, `"I am looking back at your interview details."`, `"Just to confirm, I'm speaking with Alex, correct? Here is Question 4: Could you explain the difference between optimistic and pessimistic concurrency control, and give an example of when you would use each?"`

   The other answered its own question before repeating it (`"The benefit of using a distributed database system over a centralized one is improved scalability and high availability."`). The 12-minute run did neither. One clean long run does not rule this out on that model. The first rehearsal's log was overwritten; these lines are from its console output at the time. The second's is `.../scratchpad/smoke/rehearse/et.log`.
4. **User words can land in the notebook as model turns (run 2).** After an `interrupted`, the output transcription carried the participant's words: `265.2s AI final: "write tests first. Please go to the next question."`, again at 677.8 s. The seed carried it (`"model:  write tests first. ..."`). It happens with no move near it and did no visible harm here. Not in this task's scope.

## Layer A, second pass

After commit `79a6b8ae0c` (a planned move does not start at an interrupted turn), with RealtimeClient and Gemini rebuilt. All runs on the first attempt, in parallel, from 2026-11-07T02:06:17Z. Full logs (not committed): `/private/tmp/claude-501/-Users-sohamdesai-Projects-mj-edge-MJ/37cebe67-4b02-4ff5-8834-e2f559164fbc/scratchpad/smoke/pass2/`. They contain no key or token (same search as the first pass). The first pass above stands as written, including run 1's failure.

### What changed in the script

- **Number check.** Run 1 of the first pass failed it because words of the participant reached the new connection and told the model to go on. The check now allows exactly +1 only when a user final landed between the end of the move and the question, and logs a `NUMBER CHECK:` line naming the case. Any other change still fails. One case stays from the first pass: in `--tool-across-move`, +1 is allowed because the tool prompt tells the model to end its reply to the result with the next question. No tool run was repeated in this pass.
- **New check and log fields.** A move may not start at the `turnComplete` of an interrupted turn, unless it is the helper's deadline. `MOVE done` now logs whether the participant was speaking and how many turns followed the last interruption.
- **`--quiet-before-move <n>`.** The participant starts nothing in the n seconds before the planned move.
- **A script bug, found by run d and fixed after the runs.** The window for the answer could end at the question's own log line when that line landed a millisecond later than `AskedAt`, which left the answer empty. A short call after the fix passed (`g-script-check.log`: `"You are Alex, and we are on Question 3: Describe the purpose of a relational database."`). That call does not prove the race is gone, because the race is rare; the fix is by reading the code.

### Runs

| Run | Model, flags | Started (UTC) | Move | Seed | Script | Transcript |
|---|---|---|---|---|---|---|
| a | `gemini-3.8-live --minutes 12` | 02:06:16.665 | 545.5 s, at the end of a turn | `seeded 58 entries (chars 6099, dropped 0)` | PASS | PASS |
| b | same, `--quiet-before-move 25` | 02:06:17.521 | 540.3 s, in a pause | `seeded 54 entries (chars 5921, dropped 0)` | PASS | PASS |
| c | Extended Thinking, 12 min, `--include-thoughts --settle-seconds 20` | 02:06:16.712 | 540.3 s, under the participant's words | `seeded 54 entries (chars 5496, dropped 0)` | PASS | Memory held; an answer was lost |
| d | Extended Thinking, `--connection-lifetime 130`, same flags | 02:06:17.523 | 70.2 s, under the participant's words | `seeded 6 entries (chars 678, dropped 0)` | **FAIL** (exit 1, script bug) | Memory held; part of an answer was lost |
| e | Extended Thinking, `--connection-lifetime 135`, same flags | 02:06:17.104 | 79.6 s, at the end of a turn (armed for 75 s) | `seeded 10 entries (chars 834, dropped 0)` | PASS | PASS |
| f | Extended Thinking, `--connection-lifetime 140`, same flags | 02:06:17.459 | 80.2 s, in a pause | `seeded 8 entries (chars 798, dropped 0)` | PASS | PASS |

Every run: two connections, the seed first on the second one, no `resume-seed-failed`, no greeting after the move.

**Run a.** The answer was in progress at 540 s. The move waited for the reply's end, as designed. The planned-move case here has no interruption near it: `5 turnComplete(s) since the last interruption`.

```
  538.0s USER final: "I would use a relational database with indexes, and I would write tests first. Please go to the next question."
  545.5s AI final: "Prioritizing data integrity and quality testing is essential. Question 25: How do promises resolve in JavaScript?"
  545.5s [RealtimeSessionResumption] reconnecting (connection-ending)
  552.0s PARTICIPANT says (repeat): "Sorry, please repeat the question. Which question number are we on, and what is my name?"
  564.3s AI final: "Your name is Alex, and we are on Question 25: How do promises resolve in JavaScript?"
  720.4s NUMBER CHECK: 25 before the move, 25 when asked: same number
```

**Run b.** The same-number case on planned, non-tool `gemini-3.8-live`, which the first pass did not show.

```
  521.5s AI final: "That highlights the importance of maintaining strong security practices. Question 24: How do you handle database migrations in a staging environment?"
  540.3s [RealtimeSessionResumption] reconnecting (connection-ending)
  547.0s PARTICIPANT says (repeat): "Sorry, please repeat the question. Which question number are we on, and what is my name?"
  561.0s AI final: "Your name is Alex, and we are on Question 24: How do you handle database migrations in a staging environment?"
  720.5s NUMBER CHECK: 24 before the move, 24 when asked: same number
```

**Run c.**

```
  527.8s AI final: "I would write test. Question 25: What is the purpose of a load balancer?"
  533.4s PARTICIPANT says (answer1): "In my last project, I built a create, read, update, delete service in TypeScript. Next question, please."
  540.3s [RealtimeSessionResumption] reconnecting (connection-ending)
  540.9s MOVE done: last question before it = 25, turnOpenAtStart=false, participantSpeakingAtStart=true, 2 turnComplete(s) since the last interruption, ...
  542.3s USER final: "Please."
  547.3s AI final: "Let's move to Question 26: What is the difference between a cache and a database?"
  581.9s AI final: "Your name is Alex, and we are on Question 26. The question is: What is the difference between a cache and a database?"
  720.4s NUMBER CHECK: 25 before the move, 26 when asked: +1, user final between the move and the question: "Please."
```

**Run d.** The script reported `the model did not answer the question after the move`. That is the script bug above. The transcript has the answer:

```
   67.4s PARTICIPANT says (answer3): "I would use a relational database with indexes. And I would write tests first. Please go to the next question."
   70.2s [RealtimeSessionResumption] reconnecting (connection-ending)
   75.0s USER final: "And I would write tests first. Please go to the next question."
   82.9s AI final: "Prioritizing testing ensures a very robust codebase. Question 4: How do you manage state in a complex front end application?"
  102.5s PARTICIPANT says (repeat): "Sorry, please repeat the question. Which question number are we on, and what is my name?"
  111.1s AI final: "We're currently on question four."
  119.1s AI final: "Your name is Alex, and we are on Question 4: How do you manage state in a complex front-end application?"
```

**Run e.** `114.9s AI final: "Your name is Alex, and we are currently on Question 4: What strategies would you use to optimize the performance of a web application with high traffic?"`, the question asked at 79.6 s, same number.

**Run f.** `114.4s AI final: "I'm asking Question 4, which is about the main components of a CI CD pipeline and their importance, and you are Alex."`, the question asked at 76.4 s, same number.

### Extended Thinking outcomes

Scored from the transcripts, on the reply to the question after the move and on everything else the model said after it.

| Run | Greeting or re-confirming the name | Invented question | Answered its own question | Unprompted reply | Thoughts |
|---|---|---|---|---|---|
| c (12 min) | no | no | no | not checked (owed a reply) | 0 |
| d (short) | no | no | no | not checked (owed a reply) | 0 |
| e (short) | no | no | no | none in 20.1 s | 0 |
| f (short) | no | no | no | none in 20.0 s | 0 |

Plain count, this pass: **4 runs, 4 clean on those three counts.** With the first pass and its two rehearsals: **7 moves, 5 clean, 1 greeting with an invented question, 1 answering its own question.** By length: long calls 2 of 2 clean; short calls 3 of 5 clean. Seven moves are too few to give a rate. The two bad ones are not ruled out, and neither run ran on a seed longer than 10 entries. Run d also put a short filler turn before its answer (`"We're currently on question four."`), which is correct and not scored against it.

Thoughts: 0 in all 4 runs, and 0 in the first pass, with `includeThoughts: true` in the pact. **Thought exclusion from the seed is still not exercised live.**

### Findings

1. **A planned move can still start under the participant's words when no transcription has arrived (runs c and d). The fix does not cover this, and it loses speech.** A turn opens at the first transcribed word, and Google's transcription can lag by seconds. In run c the participant had been speaking for 6.9 s when the clock ran out at 540.3 s, with `IsTurnOpen` false. No transcript of that speech ever appeared; only `"Please."` did, on the new connection. So one whole answer was lost, and the model went from question 25 to question 26 on that one word. In run d, about 2.8 s of speech was lost the same way. The audio went to the old connection before the move, so the 2 s the driver holds during a move cannot recover it. Memory held in both runs. This happened in 2 of the 6 long and short runs of this pass. Not patched: driver code is out of this task.
2. **The interrupted-turn fix is not exercised live by these runs.** None had an `interrupted` near the clock: the counts at the move are 5, 7, 2, 2, none and none `turnComplete`s since the last interruption, and the new check passed on all of them. So "an interrupted turn did not trigger the move" holds here, but only unit tests show the fix itself doing it.
