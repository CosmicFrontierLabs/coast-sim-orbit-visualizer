"""Command-line entry points for orbit-visualizer."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


def _load_json(path: Path) -> dict:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"Expected JSON object in {path}")
    return payload


def _existing_dir(path: str) -> Path:
    directory = Path(path).expanduser()
    if not directory.is_dir():
        raise argparse.ArgumentTypeError(f"does not exist or is not a directory: {directory}")
    return directory


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Serve the COASTSim orbit visualizer from saved JSON artifacts."
    )
    parser.add_argument(
        "--viz-data",
        type=Path,
        help="Path to a saved VizData JSON file served at /viz-data.",
    )
    parser.add_argument(
        "--data",
        type=Path,
        help="Optional full DITL payload JSON file served by /data endpoints.",
    )
    parser.add_argument(
        "--model-dir",
        type=_existing_dir,
        help="Optional directory served at /model for spacecraft.glb and spacecraft.config.json.",
    )
    parser.add_argument("--host", default="127.0.0.1", help="Bind host.")
    parser.add_argument("--port", type=int, default=8000, help="Bind port.")
    parser.add_argument(
        "--log-level",
        default="info",
        choices=["critical", "error", "warning", "info", "debug", "trace"],
        help="uvicorn log level.",
    )
    args = parser.parse_args()

    import uvicorn

    from . import main as app_module

    if args.data is not None:
        app_module.set_data(_load_json(args.data))
    if args.viz_data is not None:
        app_module.set_viz_data(_load_json(args.viz_data))
    if args.model_dir is not None:
        app_module.set_model_dir(args.model_dir)

    uvicorn.run(
        app_module.app,
        host=args.host,
        port=args.port,
        log_level=args.log_level,
    )


if __name__ == "__main__":
    main()
