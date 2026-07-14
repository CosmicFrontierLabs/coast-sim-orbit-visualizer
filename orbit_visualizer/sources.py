"""Load JSON artifacts from a local path or a URI.

A "source" is either a filesystem path (absolute or relative) or a URI with one
of the supported schemes:

* ``file://``  — a local file, spelled as a URI
* ``http://`` / ``https://`` — fetched over HTTP(S); public URLs need no credentials

This lets the visualizer be pointed at, e.g., a plan payload published to object
storage (``https://bucket.example.com/plan/latest/viz_data.json``) without the
caller having to download it first. Only the Python standard library is used, so
this module carries no extra dependencies and imports nothing from ``conops``.
"""

from __future__ import annotations

import json
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import urlopen

#: URI schemes fetched via :func:`urllib.request.urlopen`.
URL_SCHEMES = ("http", "https", "file")

#: Default socket timeout (seconds) for remote reads.
DEFAULT_TIMEOUT = 30.0


def read_source_bytes(src: str, *, timeout: float = DEFAULT_TIMEOUT) -> bytes:
    """Return the raw bytes at ``src`` (a local path or a supported URI).

    A bare path (no scheme) and single-character schemes — e.g. a Windows drive
    letter like ``C:\\...`` — are treated as local filesystem paths.
    """
    scheme = urlparse(str(src)).scheme.lower()
    if scheme in URL_SCHEMES:
        # nosec B310: the URI is supplied by the operator (env var / CLI flag),
        # not by an end user, and schemes are restricted to the list above.
        with urlopen(str(src), timeout=timeout) as response:  # noqa: S310
            return response.read()
    if len(scheme) <= 1:
        return Path(src).expanduser().read_bytes()
    raise ValueError(
        f"Unsupported URI scheme {scheme!r} for {src!r}; "
        f"expected a filesystem path or one of: {', '.join(URL_SCHEMES)}"
    )


def load_json_source(src: str, *, timeout: float = DEFAULT_TIMEOUT) -> dict:
    """Load and parse a JSON **object** from a local path or a supported URI.

    Raises :class:`ValueError` if the payload is not valid JSON or is not an object.
    """
    raw = read_source_bytes(src, timeout=timeout)
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Invalid JSON from {src!r}: {exc}") from exc
    if not isinstance(payload, dict):
        raise ValueError(
            f"Expected a JSON object from {src!r}, got {type(payload).__name__}"
        )
    return payload
