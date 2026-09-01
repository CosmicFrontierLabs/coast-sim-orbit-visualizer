"""FastAPI backend for orbit-visualizer.

Can be used in two ways:

1. **DITL-driven** (primary): call ``launch(ditl)`` from
   ``orbit_visualizer.backend`` to pre-load data from a completed DITL object.
   Endpoints: /data, /trajectory, /telemetry, /meta

2. **File-based** (secondary): load a saved VizData JSON artifact via
   ``ORBIT_VISUALIZER_VIZ_DATA`` or serve Plan JSON files from a directory.
   Endpoints: /plans, /plans/{filename}
   Override the plan directory with the PLANS_DIR environment variable and
   the spacecraft model directory with ORBIT_VISUALIZER_MODEL_DIR.

   ``ORBIT_VISUALIZER_VIZ_DATA`` and ``ORBIT_VISUALIZER_DATA`` accept a local
   path or a URI (``file://``, ``http://``, ``https://``), so a payload published
   to object storage can be loaded directly without downloading it first.

Usage (file-based)::
    ORBIT_VISUALIZER_VIZ_DATA=output_viz/latest_viz_data.json \
      uvicorn orbit_visualizer.main:app --port 8000

    ORBIT_VISUALIZER_VIZ_DATA=https://bucket.example.com/plan/latest/viz_data.json \
      uvicorn orbit_visualizer.main:app --port 8000
"""

import os
from pathlib import Path
from urllib.parse import urlsplit

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles

from conops.targets.plan_schema import PlanSchema

from .sources import RefreshingJSONSource, load_json_source

app = FastAPI(
    title="Orbit Visualizer API",
    description="Serves coast-sim DITL data and Plan JSON files for orbit visualization.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("CORS_ORIGINS", "http://localhost:3000").split(","),
    allow_methods=["GET"],
    allow_headers=["*"],
)

# Directory from which plan files are served.  Override with PLANS_DIR env var.
_DEFAULT_PLANS_DIR = Path(__file__).parent.parent.parent / "examples"
PLANS_DIR = Path(os.environ.get("PLANS_DIR", str(_DEFAULT_PLANS_DIR)))

_PKG_ROOT = Path(__file__).parent
_REPO_ROOT = _PKG_ROOT.parent
_ALLOW_REPO_FALLBACK = os.environ.get("ORBIT_VISUALIZER_ALLOW_REPO_DIST_FALLBACK") == "1"

_DIST_DIR = _PKG_ROOT / "dist"
if not _DIST_DIR.is_dir() and _ALLOW_REPO_FALLBACK:
    _DIST_DIR = _REPO_ROOT / "dist"


def _existing_dir(path: str | Path, label: str) -> Path:
    directory = Path(path).expanduser()
    if not directory.is_dir():
        raise NotADirectoryError(f"{label} does not exist or is not a directory: {directory}")
    return directory


_MODEL_DIR_ENV = os.environ.get("ORBIT_VISUALIZER_MODEL_DIR")
_MODEL_DIR = (
    _existing_dir(_MODEL_DIR_ENV, "ORBIT_VISUALIZER_MODEL_DIR")
    if _MODEL_DIR_ENV
    else _DIST_DIR / "model"
)
if not _MODEL_DIR_ENV and not _MODEL_DIR.is_dir() and _ALLOW_REPO_FALLBACK:
    _MODEL_DIR = _REPO_ROOT / "model"

# Explicitly staged local model assets take precedence over the derived shared
# bucket so local/offline development keeps working.
_MODEL_DIR_EXPLICIT = bool(_MODEL_DIR_ENV)

# Base URI under which spacecraft model assets live (e.g. the public shared
# bucket). When resolved, /model/* redirects there so the browser fetches the
# assets directly and updates propagate without restaging the container host.
_MODEL_BASE_URI = os.environ.get("ORBIT_VISUALIZER_MODEL_BASE_URI", "").rstrip("/") or None

# Derived from the viz-data source when it is an http(s) URI: the model is
# published in the same shared bucket under /model.
_DERIVED_MODEL_BASE_URI: str | None = None


def derive_model_base_uri(source: str) -> str | None:
    """Return the /model base on the same origin as an http(s) viz-data URI."""
    parts = urlsplit(source)
    if parts.scheme in ("http", "https") and parts.netloc:
        return f"{parts.scheme}://{parts.netloc}/model"
    return None


def resolved_model_base_uri() -> str | None:
    """Model base URI to redirect to, or None to serve the local model dir."""
    if _MODEL_BASE_URI:
        return _MODEL_BASE_URI
    if _MODEL_DIR_EXPLICIT:
        return None
    return _DERIVED_MODEL_BASE_URI

_TEXTURES_DIR = _DIST_DIR / "textures"
if not _TEXTURES_DIR.is_dir() and _ALLOW_REPO_FALLBACK:
    _TEXTURES_DIR = _REPO_ROOT / "textures"

# In-memory DITL payload set by launch() / set_data()
_data: dict | None = None
_viz_data: dict | None = None
_viz_data_source: RefreshingJSONSource | None = None


def _viz_data_refresh_interval() -> float:
    raw = os.environ.get("ORBIT_VISUALIZER_VIZ_DATA_REFRESH_SECONDS", "60")
    try:
        interval = float(raw)
    except ValueError as exc:
        raise ValueError(
            "ORBIT_VISUALIZER_VIZ_DATA_REFRESH_SECONDS must be a number"
        ) from exc
    if interval < 0:
        raise ValueError(
            "ORBIT_VISUALIZER_VIZ_DATA_REFRESH_SECONDS must be non-negative"
        )
    return interval


def set_data(payload: dict) -> None:
    """Load a pre-serialized DITL payload into memory for serving."""
    global _data
    _data = payload


def set_viz_data(payload: dict) -> None:
    """Load the 3-D VizData payload for the frontend."""
    global _viz_data, _viz_data_source
    _viz_data = payload
    _viz_data_source = None


def set_model_dir(path: str | Path) -> None:
    """Set the directory served under /model for supplied spacecraft assets."""
    global _MODEL_DIR, _MODEL_DIR_EXPLICIT
    _MODEL_DIR = _existing_dir(path, "model_dir")
    _MODEL_DIR_EXPLICIT = True


def set_model_base_uri(uri: str) -> None:
    """Set the base URI that /model/* redirects to for spacecraft assets."""
    global _MODEL_BASE_URI
    _MODEL_BASE_URI = uri.rstrip("/") or None


def set_viz_data_source(
    source: str, *, refresh_interval_seconds: float | None = None
) -> None:
    """Load viz data from a path/URI, deriving the shared-bucket model base."""
    global _DERIVED_MODEL_BASE_URI, _viz_data, _viz_data_source
    refresh_interval = (
        _viz_data_refresh_interval()
        if refresh_interval_seconds is None
        else refresh_interval_seconds
    )
    refreshing_source = RefreshingJSONSource(
        source, refresh_interval=refresh_interval
    )
    payload = refreshing_source.get(force=True)
    _viz_data = payload
    _viz_data_source = refreshing_source
    _DERIVED_MODEL_BASE_URI = derive_model_base_uri(source)


def _load_json_env(name: str) -> dict | None:
    source = os.environ.get(name)
    if not source:
        return None
    try:
        return load_json_source(source)
    except Exception as exc:
        raise RuntimeError(f"Failed to load {name}={source}: {exc}") from exc


def load_startup_payloads() -> None:
    """Load optional JSON payloads configured through environment variables."""
    data_payload = _load_json_env("ORBIT_VISUALIZER_DATA")
    if data_payload is not None:
        set_data(data_payload)

    viz_source = os.environ.get("ORBIT_VISUALIZER_VIZ_DATA")
    if viz_source:
        try:
            set_viz_data_source(viz_source)
        except Exception as exc:
            raise RuntimeError(
                f"Failed to load ORBIT_VISUALIZER_VIZ_DATA={viz_source}: {exc}"
            ) from exc


load_startup_payloads()


@app.middleware("http")
async def disable_frontend_caching(request: Request, call_next):
    """Disable browser caching for frontend assets to avoid stale UIs."""
    response = await call_next(request)
    path = request.url.path
    is_frontend = (
        path == "/"
        or path == "/viz-data"
        or path.startswith("/assets/")
        or path.startswith("/model/")
        or path.startswith("/textures/")
        or path.endswith(".js")
        or path.endswith(".css")
        or path.endswith(".html")
        or path.endswith(".map")
    )
    if request.method == "GET" and is_frontend:
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response


# ---------------------------------------------------------------------------
# DITL-driven routes
# ---------------------------------------------------------------------------


@app.get("/")
def index() -> Response:
    """Serve the Vite-built orbit visualizer frontend."""
    index_html = _DIST_DIR / "index.html"
    if not index_html.is_file():
        return HTMLResponse(
            "<h2>Frontend not built. Run <code>npm run build</code> first.</h2>",
            status_code=503,
        )
    return FileResponse(index_html)


@app.get("/viz-data")
def get_viz_data() -> dict:
    """Return VizData payload for the 3-D orbit visualizer frontend."""
    global _viz_data
    if _viz_data_source is not None:
        _viz_data = _viz_data_source.get()
    if _viz_data is None:
        raise HTTPException(
            status_code=404,
            detail="No DITL data loaded. Call launch(ditl) first.",
        )
    return _viz_data


@app.get("/health")
def health() -> dict:
    result = {
        "status": "ok",
        "revision": os.environ.get("ORBIT_VISUALIZER_REVISION", "unknown"),
    }
    if _viz_data_source is not None:
        source_status = _viz_data_source.status()
        result["viz_data"] = source_status
        if source_status["last_error"] is not None:
            result["status"] = "degraded"
    else:
        result["viz_data"] = {
            "source": "in-memory",
            "loaded": _viz_data is not None,
        }
    return result


@app.get("/data")
def get_data() -> dict:
    """Return the full DITL payload: meta, trajectory, telemetry, and plan."""
    if _data is None:
        raise HTTPException(
            status_code=404,
            detail="No DITL data loaded. Call launch(ditl) first.",
        )
    return _data


@app.get("/trajectory")
def get_trajectory() -> list:
    """Return the spacecraft ECI trajectory: [{t, x, y, z}] in km."""
    if _data is None:
        raise HTTPException(status_code=404, detail="No DITL data loaded.")
    return _data["trajectory"]


@app.get("/telemetry")
def get_telemetry() -> list:
    """Return housekeeping telemetry records, one per DITL timestep."""
    if _data is None:
        raise HTTPException(status_code=404, detail="No DITL data loaded.")
    return _data["telemetry"]


@app.get("/meta")
def get_meta() -> dict:
    """Return mission metadata."""
    if _data is None:
        raise HTTPException(status_code=404, detail="No DITL data loaded.")
    return _data["meta"]


# ---------------------------------------------------------------------------
# File-based plan routes
# ---------------------------------------------------------------------------


@app.get("/plans")
def list_plans() -> list[str]:
    """Return the names of all plan JSON files in PLANS_DIR."""
    if not PLANS_DIR.is_dir():
        raise HTTPException(status_code=500, detail=f"Plans directory not found: {PLANS_DIR}")
    return sorted(f.name for f in PLANS_DIR.glob("plan_*.json"))


@app.get("/plans/{filename}")
def get_plan(filename: str) -> dict:
    """Load and return a single plan file as JSON.

    The returned object matches the PlanSchema structure:
    ``{ version, start, end, entries: [ { name, ra, dec, roll, begin, end, ... } ] }``
    """
    # Prevent directory traversal
    if "/" in filename or "\\" in filename or ".." in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")

    path = PLANS_DIR / filename
    if not path.is_file():
        raise HTTPException(status_code=404, detail=f"Plan not found: {filename}")

    try:
        schema = PlanSchema.load(path)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Failed to parse plan: {exc}") from exc

    return schema.model_dump(mode="json")


@app.get("/model/{asset_path:path}")
def get_model_asset(asset_path: str) -> Response:
    """Serve spacecraft model assets, redirecting to the shared bucket when configured."""
    requested = Path(asset_path)
    if requested.is_absolute() or ".." in requested.parts:
        raise HTTPException(status_code=400, detail="Invalid model asset path")

    base_uri = resolved_model_base_uri()
    if base_uri is not None:
        return RedirectResponse(f"{base_uri}/{asset_path}", status_code=307)

    path = _MODEL_DIR / requested
    if not path.is_file():
        raise HTTPException(status_code=404, detail=f"Model asset not found: {asset_path}")
    return FileResponse(path)


# Serve Vite build assets (hashed filenames under dist/assets/).  This mount
# acts as a catch-all for requests not matched by any API route above.
app.mount("/textures", StaticFiles(directory=_TEXTURES_DIR, check_dir=False), name="textures")
app.mount("/", StaticFiles(directory=_DIST_DIR, html=True, check_dir=False), name="static")
