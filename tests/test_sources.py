import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from tempfile import TemporaryDirectory

from orbit_visualizer.sources import load_json_source, read_source_bytes


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


if __name__ == "__main__":
    unittest.main()
