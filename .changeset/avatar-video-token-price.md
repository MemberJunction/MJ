---
"@memberjunction/ai": minor
"@memberjunction/core-entities": minor
"@memberjunction/ai-engine-base": minor
"@memberjunction/core-entities-server": minor
"@memberjunction/ai-agents": minor
---

The avatar video price can be per token (#5312). `Realtime.Pricing.AvatarVideoOutput.Unit` accepts `'Per 1M Tokens'` beside `'Per Minute'`, in Core's configuration types, the AI configuration JSON type and the generated entity types. At that unit, pricing puts the run's output video tokens (`RealtimeUsage.Output.VideoTokens`) on the video cost line, measured in tokens; the tokens still leave the cost row's output bucket. A run that stored video seconds but no video tokens is priced as before, with one log line. A per-minute price prices the stored seconds exactly as before. The stored output video tokens are now capped like the seconds: at 6,192 tokens a second of the run's elapsed time plus 30 seconds, with a log line when the cap applies. Gemini 3.8 Live's Vertex AI row is seeded at $1.00 per 1M tokens: Google bills avatar video only while the avatar speaks, and the stored seconds also count the idle avatar between answers.
