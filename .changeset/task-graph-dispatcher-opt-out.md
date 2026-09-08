---
'@memberjunction/server': patch
---

A host can run MJServer without the task-graph dispatcher

`MJ_DISABLE_TASK_GRAPH_DISPATCHER=1` suppresses the durable dispatcher at boot. There was no way to
do this before: the dispatcher started unconditionally wherever the data source was SQL Server.

The case that needs it is the integration suite. `IT74 - Task Graph Execution` drives its own
dispatcher against a stub runner and asserts exactly-once execution, but a dispatcher claims from the
whole task table rather than from its own graphs — so any MJServer sharing that database races the
suite for every claim and runs the suite's tasks with the real agent runner. The bundle then reports
tasks that never ran and graphs that settled to the wrong status, with the winner of each race
differing per run. The suite still needs MJAPI up for its client-transport members, so stopping the
server is not an option.

Unset, behaviour is unchanged.
