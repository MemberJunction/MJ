---
"@memberjunction/cli": patch
---

`mj agent init --skip-docker-check` now does what its description says: it skips the Docker availability probe and assumes Docker is running. It previously decided Docker was *unavailable*, so the stack was never started and the user was told to launch Docker Desktop — exactly the users who pass the flag (remote daemon, colima, Podman) got no environment. Pass `--no-start` to scaffold without starting the stack.
