---
"@memberjunction/actions": patch
---

Align ActionEngine test mock with the recent LogErrorEx switch in InternalRunAction's catch block, restoring the previously failing "should catch errors from action execution" test and silencing stderr noise from two other passing tests.
