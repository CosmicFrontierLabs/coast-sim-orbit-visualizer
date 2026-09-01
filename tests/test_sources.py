import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from tempfile import TemporaryDirectory
from urllib.error import HTTPError

from orbit_visualizer.sources import (
    RefreshingJSONSource,
    load_json_source,
    read_source_bytes,
)


class _JSONHandler(BaseHTTPRequestHandler):
    body = b'{"hello": "world"}'

    def do_GET(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler API
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(self.body)))
        self.end_headers()
        self.wfile.write(self.body)

    def log_message(self, *args) -> None:  # silence test-server logging
        pass


class _RefreshingJSONHandler(BaseHTTPRequestHandler):
    body = b'{"version": 1}'
    etag = '"v1"'
    last_modified = "Mon, 31 Aug 2026 06:41:05 GMT"
    status_code = 200
    truncate_body = False
    request_headers: list[dict[str, str | None]] = []

    def do_GET(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler API
        type(self).request_headers.append(
            {
                "if-none-match": self.headers.get("If-None-Match"),
                "if-modified-since": self.headers.get("If-Modified-Since"),
            }
        )
        if self.status_code != 200:
            self.send_error(self.status_code)
            return
        if self.headers.get("If-None-Match") == self.etag:
            self.send_response(304)
            self.end_headers()
            return
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        content_length = len(self.body) + 10 if self.truncate_body else len(self.body)
        self.send_header("Content-Length", str(content_length))
        self.send_header("ETag", self.etag)
        self.send_header("Last-Modified", self.last_modified)
        self.end_headers()
        self.wfile.write(self.body)

    def log_message(self, *args) -> None:  # silence test-server logging
        pass


class ReadSourceBytesTests(unittest.TestCase):
    def test_local_path(self) -> None:
        with TemporaryDirectory() as tmp:
            path = Path(tmp) / "viz.json"
            path.write_text('{"a": 1}', encoding="utf-8")
            self.assertEqual(read_source_bytes(str(path)), b'{"a": 1}')

    def test_file_uri(self) -> None:
        with TemporaryDirectory() as tmp:
            path = Path(tmp) / "viz.json"
            path.write_text('{"a": 1}', encoding="utf-8")
            self.assertEqual(read_source_bytes(path.as_uri()), b'{"a": 1}')

    def test_rejects_unknown_scheme(self) -> None:
        with self.assertRaises(ValueError):
            read_source_bytes("ftp://example.com/viz.json")


class LoadJSONSourceTests(unittest.TestCase):
    def test_local_path(self) -> None:
        with TemporaryDirectory() as tmp:
            path = Path(tmp) / "viz.json"
            path.write_text('{"a": 1}', encoding="utf-8")
            self.assertEqual(load_json_source(str(path)), {"a": 1})

    def test_file_uri(self) -> None:
        with TemporaryDirectory() as tmp:
            path = Path(tmp) / "viz.json"
            path.write_text('{"a": 2}', encoding="utf-8")
            self.assertEqual(load_json_source(path.as_uri()), {"a": 2})

    def test_http_uri(self) -> None:
        server = HTTPServer(("127.0.0.1", 0), _JSONHandler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            host, port = server.server_address
            url = f"http://{host}:{port}/latest/viz_data.json"
            self.assertEqual(load_json_source(url), {"hello": "world"})
        finally:
            server.shutdown()
            thread.join()
            server.server_close()

    def test_rejects_non_object_json(self) -> None:
        with TemporaryDirectory() as tmp:
            path = Path(tmp) / "arr.json"
            path.write_text("[1, 2, 3]", encoding="utf-8")
            with self.assertRaises(ValueError):
                load_json_source(str(path))

    def test_rejects_invalid_json(self) -> None:
        with TemporaryDirectory() as tmp:
            path = Path(tmp) / "bad.json"
            path.write_text("{not json", encoding="utf-8")
            with self.assertRaises(ValueError):
                load_json_source(str(path))


class RefreshingJSONSourceTests(unittest.TestCase):
    def setUp(self) -> None:
        _RefreshingJSONHandler.body = b'{"version": 1}'
        _RefreshingJSONHandler.etag = '"v1"'
        _RefreshingJSONHandler.last_modified = "Mon, 31 Aug 2026 06:41:05 GMT"
        _RefreshingJSONHandler.status_code = 200
        _RefreshingJSONHandler.truncate_body = False
        _RefreshingJSONHandler.request_headers = []
        self.server = HTTPServer(("127.0.0.1", 0), _RefreshingJSONHandler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        host, port = self.server.server_address
        self.url = f"http://{host}:{port}/latest/viz_data.json"

    def tearDown(self) -> None:
        self.server.shutdown()
        self.thread.join()
        self.server.server_close()

    def test_conditional_refresh_reuses_unchanged_payload(self) -> None:
        source = RefreshingJSONSource(self.url)

        first = source.get()
        second = source.get()

        self.assertIs(second, first)
        self.assertEqual(second, {"version": 1})
        self.assertEqual(len(_RefreshingJSONHandler.request_headers), 2)
        self.assertEqual(
            _RefreshingJSONHandler.request_headers[1],
            {
                "if-none-match": '"v1"',
                "if-modified-since": "Mon, 31 Aug 2026 06:41:05 GMT",
            },
        )
        status = source.status()
        self.assertEqual(status["refresh_interval_seconds"], 0)
        self.assertEqual(status["etag"], '"v1"')
        self.assertIsNone(status["last_error"])

    def test_changed_etag_atomically_replaces_payload(self) -> None:
        source = RefreshingJSONSource(self.url, refresh_interval=0)
        self.assertEqual(source.get(), {"version": 1})
        original_loaded_at = source.status()["loaded_at"]

        _RefreshingJSONHandler.body = b'{"version": 2}'
        _RefreshingJSONHandler.etag = '"v2"'
        self.assertEqual(source.get(), {"version": 2})

        status = source.status()
        self.assertEqual(status["etag"], '"v2"')
        self.assertGreaterEqual(status["loaded_at"], original_loaded_at)
        self.assertIsNone(status["last_error"])

    def test_invalid_update_preserves_last_valid_payload(self) -> None:
        source = RefreshingJSONSource(self.url, refresh_interval=0)
        self.assertEqual(source.get(), {"version": 1})

        _RefreshingJSONHandler.body = b"{invalid"
        _RefreshingJSONHandler.etag = '"invalid"'
        self.assertEqual(source.get(), {"version": 1})
        self.assertIn("ValueError", source.status()["last_error"])

        _RefreshingJSONHandler.body = b'{"version": 2}'
        _RefreshingJSONHandler.etag = '"v2"'
        self.assertEqual(source.get(), {"version": 2})
        self.assertIsNone(source.status()["last_error"])

    def test_remote_failure_preserves_last_valid_payload(self) -> None:
        source = RefreshingJSONSource(self.url, refresh_interval=0)
        self.assertEqual(source.get(), {"version": 1})

        _RefreshingJSONHandler.status_code = 503
        self.assertEqual(source.get(), {"version": 1})
        self.assertIn("HTTPError", source.status()["last_error"])

    def test_truncated_update_preserves_last_valid_payload(self) -> None:
        source = RefreshingJSONSource(self.url, refresh_interval=0)
        self.assertEqual(source.get(), {"version": 1})

        _RefreshingJSONHandler.body = b'{"version": 2}'
        _RefreshingJSONHandler.etag = '"v2"'
        _RefreshingJSONHandler.truncate_body = True
        self.assertEqual(source.get(), {"version": 1})
        self.assertIn("IncompleteRead", source.status()["last_error"])

    def test_refresh_interval_avoids_rechecking_source(self) -> None:
        source = RefreshingJSONSource(self.url, refresh_interval=3600)
        self.assertEqual(source.get(), {"version": 1})

        _RefreshingJSONHandler.body = b'{"version": 2}'
        _RefreshingJSONHandler.etag = '"v2"'
        self.assertEqual(source.get(), {"version": 1})
        self.assertEqual(len(_RefreshingJSONHandler.request_headers), 1)
        self.assertEqual(source.get(force=True), {"version": 2})

    def test_initial_failure_is_fatal(self) -> None:
        _RefreshingJSONHandler.status_code = 503
        source = RefreshingJSONSource(self.url, refresh_interval=0)
        with self.assertRaisesRegex(HTTPError, "Service Unavailable"):
            source.get()

    def test_rejects_local_sources(self) -> None:
        with self.assertRaisesRegex(ValueError, r"HTTP\(S\)"):
            RefreshingJSONSource("viz_data.json")

    def test_rejects_non_finite_refresh_intervals(self) -> None:
        for interval in (float("nan"), float("inf"), float("-inf"), -1):
            with self.subTest(interval=interval):
                with self.assertRaisesRegex(ValueError, "finite and non-negative"):
                    RefreshingJSONSource(self.url, refresh_interval=interval)


if __name__ == "__main__":
    unittest.main()
