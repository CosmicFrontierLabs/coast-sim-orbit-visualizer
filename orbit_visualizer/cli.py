"""Command-line entry points for orbit-visualizer."""

from __future__ import annotations

import argparse
from pathlib import Path

from .sources import load_json_source


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
        help=(
            "Path or URI (file://, http://, https://) to a saved VizData JSON file "
            "served at /viz-data."
        ),
    )
    parser.add_argument(
        "--data",
        help=(
            "Optional path or URI (file://, http://, https://) to a full DITL payload "
            "JSON file served by /data endpoints."
        ),
    )
    parser.add_argument(
        "--model-dir",
        type=_existing_dir,
        help="Optional directory served at /model for spacecraft.glb and spacecraft.config.json.",
    )
    parser.add_argument(
        "--model-base-uri",
        help=(
            "Optional base URI that /model/* redirects to for spacecraft assets "
            "(e.g. https://<bucket>.s3.<region>.amazonaws.com/model). When omitted "
            "and --viz-data is an http(s) URI, the same origin's /model is used "
            "unless --model-dir is given."
        ),
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
        app_module.set_data(load_json_source(args.data))
    if args.viz_data is not None:
        app_module.set_viz_data_source(args.viz_data)
    if args.model_dir is not None:
        app_module.set_model_dir(args.model_dir)
    if args.model_base_uri is not None:
        app_module.set_model_base_uri(args.model_base_uri)

    uvicorn.run(
        app_module.app,
        host=args.host,
        port=args.port,
        log_level=args.log_level,
    )


if __name__ == "__main__":
    main()
