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
import logging
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

#: URI schemes fetched via :func:`urllib.request.urlopen`.
URL_SCHEMES = ("http", "https", "file")

#: Default socket timeout (seconds) for remote reads.
DEFAULT_TIMEOUT = 30.0

logger = logging.getLogger(__name__)


def _parse_json_object(raw: bytes, src: str) -> dict:
    """Parse a JSON object read from ``src``."""
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Invalid JSON from {src!r}: {exc}") from exc
    if not isinstance(payload, dict):
        raise ValueError(
            f"Expected a JSON object from {src!r}, got {type(payload).__name__}"
        )
    return payload


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
    return _parse_json_object(read_source_bytes(src, timeout=timeout), src)


class RefreshingJSONSource:
    """Cache a JSON object while periodically revalidating its source.

    HTTP(S) sources use conditional requests after the initial load. Local paths
    and ``file://`` URIs are reread after the refresh interval. Once a valid
    payload has loaded, a transient read or validation failure preserves that
    last-known-good payload and is reported through :attr:`status`.
    """

    def __init__(
        self,
        src: str,
        *,
        refresh_interval: float = 60.0,
        timeout: float = DEFAULT_TIMEOUT,
    ) -> None:
        if refresh_interval < 0:
            raise ValueError("refresh_interval must be non-negative")
        self.src = str(src)
        self.refresh_interval = float(refresh_interval)
        self.timeout = float(timeout)
        self._lock = threading.Lock()
        self._payload: dict | None = None
        self._etag: str | None = None
        self._source_last_modified: str | None = None
        self._loaded_at: str | None = None
        self._checked_at: str | None = None
        self._last_error: str | None = None
        self._last_check_monotonic: float | None = None

    @staticmethod
    def _utc_now() -> str:
        return datetime.now(timezone.utc).isoformat()

    def _read_remote(self) -> tuple[dict | None, str | None, str | None]:
        headers = {}
        if self._etag:
            headers["If-None-Match"] = self._etag
        if self._source_last_modified:
            headers["If-Modified-Since"] = self._source_last_modified

        request = Request(self.src, headers=headers)
        try:
            # nosec B310: the operator supplies the URI and schemes are restricted.
            with urlopen(request, timeout=self.timeout) as response:  # noqa: S310
                payload = _parse_json_object(response.read(), self.src)
                return (
                    payload,
                    response.headers.get("ETag"),
                    response.headers.get("Last-Modified"),
                )
        except HTTPError as exc:
            if exc.code == 304 and self._payload is not None:
                return None, self._etag, self._source_last_modified
            raise

    def _read(self) -> tuple[dict | None, str | None, str | None]:
        scheme = urlparse(self.src).scheme.lower()
        if scheme in ("http", "https"):
            return self._read_remote()
        return load_json_source(self.src, timeout=self.timeout), None, None

    def get(self, *, force: bool = False) -> dict:
        """Return the latest valid payload, refreshing when the interval expires."""
        with self._lock:
            now = time.monotonic()
            refresh_due = (
                force
                or self._payload is None
                or self._last_check_monotonic is None
                or now - self._last_check_monotonic >= self.refresh_interval
            )
            if not refresh_due:
                assert self._payload is not None
                return self._payload

            self._last_check_monotonic = now
            try:
                payload, etag, source_last_modified = self._read()
            except (OSError, ValueError) as exc:
                self._checked_at = self._utc_now()
                self._last_error = f"{type(exc).__name__}: {exc}"
                if self._payload is None:
                    raise
                logger.warning(
                    "Failed to refresh JSON source %s; serving last valid payload: %s",
                    self.src,
                    self._last_error,
                )
                return self._payload

            completed_at = self._utc_now()
            self._checked_at = completed_at
            self._last_error = None
            if payload is not None:
                self._payload = payload
                self._etag = etag
                self._source_last_modified = source_last_modified
                self._loaded_at = completed_at
            assert self._payload is not None
            return self._payload

    def status(self) -> dict[str, Any]:
        """Return operator-facing source freshness metadata."""
        with self._lock:
            return {
                "source": self.src,
                "refresh_interval_seconds": self.refresh_interval,
                "etag": self._etag,
                "source_last_modified": self._source_last_modified,
                "loaded_at": self._loaded_at,
                "checked_at": self._checked_at,
                "last_error": self._last_error,
            }
