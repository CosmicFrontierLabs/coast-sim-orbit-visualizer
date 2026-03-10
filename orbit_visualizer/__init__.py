"""orbit-visualizer backend.

Usage from Python (e.g. a Jupyter notebook after running a DITL simulation)::

    from orbit_visualizer import launch

    ditl.calc()
    launch(ditl)                                     # non-blocking, opens /docs
    launch(ditl, port=8001, open_browser=False)      # custom port, no browser
    launch(ditl, blocking=True)                      # block until server exits
"""

from __future__ import annotations

import threading
import webbrowser
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from conops.ditl import DITL


def launch(
    ditl: "DITL",
    port: int = 8000,
    *,
    open_browser: bool = True,
    blocking: bool = False,
):
    """Start the orbit-visualizer API server pre-loaded with DITL data.

    Parameters
    ----------
    ditl:
        A completed DITL instance (``ditl.calc()`` must have been called).
    port:
        TCP port to listen on (default 8000).
    open_browser:
        Open the Swagger UI in a browser after startup (default True).
    blocking:
        If True, block until the server exits (useful in scripts).
        If False (default), run in a daemon thread (useful in notebooks).

    Returns
    -------
    uvicorn.Server | None
        The server instance when non-blocking, None when blocking.
    """
    import uvicorn

    from . import main as _app_module
    from .serializer import ditl_to_payload

    payload = ditl_to_payload(ditl)
    _app_module.set_data(payload)

    config = uvicorn.Config(
        _app_module.app,
        host="0.0.0.0",
        port=port,
        log_level="info",
    )
    server = uvicorn.Server(config)

    if open_browser:
        threading.Timer(
            1.5, lambda: webbrowser.open(f"http://localhost:{port}/docs")
        ).start()

    if blocking:
        server.run()
        return None

    t = threading.Thread(target=server.run, daemon=True)
    t.start()
    return server
