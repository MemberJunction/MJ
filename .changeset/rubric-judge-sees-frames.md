---
"@memberjunction/rubrics": minor
"@memberjunction/computer-use": minor
"@memberjunction/computer-use-engine": minor
---

The rubric judge can see screenshots. `RubricSubjectContent.images` carries labelled frames, `BuildSubjectContent` sends them as image blocks after the subject text, and the LLM evaluator accepts `{"frame": "<label>"}` as evidence. The Computer Use driver sends up to `rubricFrames` (default 6) chosen frames: checkpoints, judge verdict changes, a spread of steps, and the final frame, which the engine now captures after the last step's actions (`ComputerUseResult.FinalFrameCapturedAfterActions`). A rubric oracle on a computer use test that is judged after the run defaults to the new `Rubric Judge - Computer Use` prompt on vision models. Scoring a test run after the run attaches a spread of its saved screenshots.
