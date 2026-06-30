"""Predictive Studio ML sidecar launcher.

Self-managing entrypoint for the FastAPI `app` defined in ``app.main``. Mirrors
the ephemeral-port mechanism used by ``@memberjunction/sqlglot-ts``'s
``server.py``: bind 127.0.0.1 on port 0 (or an explicit port arg), discover the
assigned port, print it as ``PREDICTIVE_STUDIO_SIDECAR_PORT=<n>`` on stdout so the
TypeScript ``MLSidecar`` client can read it, then uvicorn-serve.

Usage:
    python server.py [port]

When ``port`` is ``0`` (the default the TS client passes) an ephemeral port is
chosen automatically.
"""
from __future__ import annotations

import socket
import sys

import uvicorn

from app.main import app


def _resolve_port(requested_port: int) -> int:
    """Resolve an actual listen port.

    When ``requested_port`` is 0, bind a throwaway socket to 127.0.0.1:0 to let
    the OS assign a free ephemeral port, read it back, then close the socket and
    hand the port to uvicorn. There is a tiny race window between close and
    re-bind, which is acceptable for a local-only dev/managed service.
    """
    if requested_port != 0:
        return requested_port
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]
    finally:
        sock.close()


def main() -> None:
    """Entrypoint: resolve the listen port, announce it on stdout, run uvicorn.

    Reads an optional port from ``argv[1]`` (0/absent ⇒ OS-assigned ephemeral
    port). The resolved port is printed as ``PREDICTIVE_STUDIO_SIDECAR_PORT=<n>``
    on the first stdout line BEFORE uvicorn starts, so the managing TypeScript
    ``MLSidecar`` client can parse it and poll ``/health``.
    """
    requested_port = int(sys.argv[1]) if len(sys.argv) > 1 else 0
    actual_port = _resolve_port(requested_port)

    # Print the port BEFORE uvicorn starts so the TS client can read it from stdout.
    print(f"PREDICTIVE_STUDIO_SIDECAR_PORT={actual_port}", flush=True)

    uvicorn.run(app, host="127.0.0.1", port=actual_port, log_level="warning")


if __name__ == "__main__":
    main()
