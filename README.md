# orbit-visualizer

Interactive 3-D orbit visualizer for [COASTSim](../README.md) DITL simulations. Pass a completed `DITL` object to `launch()` and a full Three.js visualization opens in your browser — live animation, scrubber timeline, HUD, and camera controls.

## Installation

```bash
# Python package (frontend bundle is included in the wheel)
pip install -e .
```

```bash
# Frontend build is only needed when developing this repo
cd orbit-visualizer
npm install
npm run build
```

> **Note:** `astropy` and `numpy` must be available in your Python environment for the serializer to compute sun vectors, eclipse flags, and beta angles.

## Usage

From a completed DITL object:

```python
from orbit_visualizer import launch

ditl.calc()
launch(ditl)          # starts server + opens http://localhost:8000
```

To serve supplied spacecraft assets with the live DITL:

```python
launch(ditl, model_dir="path/to/model")
```

`model_dir` should contain `spacecraft.glb` and, when needed, a matching
`spacecraft.config.json`.

From a saved `viz_data.json` artifact:

```bash
orbit-visualizer \
  --viz-data path/to/viz_data.json \
  --model-dir path/to/model
```

`--viz-data` (and `--data`) accept a local path **or** a URI — `file://`,
`http://`, or `https://` — so a payload published to object storage can be loaded
directly. Public URLs need no credentials:

```bash
orbit-visualizer --viz-data https://bucket.example.com/plan/latest/viz_data.json
```

or with `uvicorn` directly:

```bash
ORBIT_VISUALIZER_VIZ_DATA=path/to/viz_data.json \
ORBIT_VISUALIZER_MODEL_DIR=path/to/model \
  uvicorn orbit_visualizer.main:app --host 127.0.0.1 --port 8000

# ORBIT_VISUALIZER_VIZ_DATA and ORBIT_VISUALIZER_DATA also accept file://, http://, https:// URIs.
```

### Options

```python
launch(ditl, port=8001)             # custom port
launch(ditl, open_browser=False)    # don't open browser automatically
launch(ditl, blocking=True)         # block until server exits (useful in scripts)
launch(ditl, model_dir="...")       # serve supplied spacecraft assets at /model
```

## What you see

| Panel        | Contents                                                 |
| ------------ | -------------------------------------------------------- |
| **ORBIT**    | Altitude, latitude, longitude, beta angle, eclipse state |
| **ATTITUDE** | RA, Dec, Roll, solar panel angle to Sun                  |
| **TARGET**   | Pointing mode and current target name                    |
| **Controls** | Playback speed, axis/grid overlays, camera view selector |

The scrubber timeline at the bottom shows PPST observation windows. Drag the slider or let it play in real time. Camera tracks the spacecraft by default; switch to Earth-fixed or horizon views from the dropdown.

Drag a `viz_data.json` file onto the canvas to load data without a running Python backend.

### Thermal attitude geometry

The Plan Statistics page derives duration-weighted thermal geometry from the
executed inertial-to-body quaternion telemetry. It includes:

- panel Sun-incidence angle and a front-face map showing which body-axis side
  the Sun comes from;
- shared-scale Sun and Earth-center cube maps on the six spacecraft body faces;
- body-frame Sun/Earth direction-cosine time series; and
- direct-Sun projection, Earth-disk view factor, and complementary clear-sky
  view factor for each body face and the configured panel normal.

`Sun eq.` is the integral of `max(0, normal dot sun_direction)` outside eclipse,
expressed as equivalent seconds at normal incidence. Sun dwell is reported at
10%, 50%, and 90% projected-load thresholds so grazing illumination is not
presented as full thermal loading. Earth is treated as a finite apparent disk.
The Earth view factor integrates projected solid angle over that disk; the
deep-space view factor is its complement and assumes a convex, unobstructed
surface with no spacecraft self-view.

These are exposure-geometry diagnostics, not predicted heat fluxes or
temperatures. Applying them thermally requires surface area, absorptivity,
emissivity, Earth IR/albedo models, internal dissipation, and thermal coupling.
The JSON and CSV Plan Statistics exports include the per-surface results and
body-direction time series for downstream analysis.

## Spacecraft Model Configuration

The public visualizer repo does not own mission spacecraft assets. Mission
repos should keep the real `spacecraft.glb`, matching `spacecraft.config.json`,
and generated schedule/viz artifacts together. The visualizer only expects
those assets to be served under `/model/` at runtime.

For local development, place temporary spacecraft model assets in `model/`.
The visualizer loads `model/spacecraft.glb` when present, but GLB files and the
runtime `model/spacecraft.config.json` are ignored by git.

There are two different frames involved:

- **CAD/GLB model frame**: the local axes baked into `model/spacecraft.glb` by
  the CAD export. These axes only describe how the mesh was authored.
- **COAST spacecraft frame**: the body frame used by COAST `viz_data` attitude
  output. The visualizer evaluates COAST RA/Dec/Roll into this frame, where
  `+X_SC` is the spacecraft boresight. Roll is a right-handed physical
  spacecraft rotation about `+X_SC`.

The optional runtime `model/spacecraft.config.json` file maps the CAD/GLB model
frame into the COAST spacecraft frame. It does not change the COAST attitude
output; it only rotates the rendered mesh before the COAST attitude is applied.

This repo tracks `model/spacecraft.config.example.json` only. Copy or adapt
that example into the mission repo next to the actual GLB:

```json
{
  "modelFrame": {
    "asset": "model/spacecraft.glb",
    "description": "CAD/GLB local axes as authored in the spacecraft model file"
  },
  "spacecraftFrame": {
    "source": "COAST viz_data attitude output",
    "description": "COAST spacecraft body frame applied by the visualizer after RA/Dec/Roll attitude is evaluated; +X_SC is boresight"
  },
  "axisMapping": {
    "modelBoresight": "+Z",
    "spacecraftBoresight": "+X",
    "rollAboutSpacecraftBoresightDeg": 90
  }
}
```

In the example above, the CAD/GLB mesh's boresight is along model-local `+Z`.
COAST's spacecraft boresight is `+X_SC`, so the visualizer first aligns
model-local `+Z` to spacecraft-frame `+X_SC`, then applies a 90 degree
right-hand roll about `+X_SC` so the model cross axes match the COAST
spacecraft frame.

Axis values may be `+X`, `-X`, `+Y`, `-Y`, `+Z`, `-Z`, or a numeric vector
like `[1, 0, 0]`. If no config file is present, model axes are assumed to
already match the COAST spacecraft frame.

## Project layout

```text
app/                  # Vite entry point (index.html, orbit_viz.ts, CSS)
src/                  # TypeScript modules (Three.js scene, HUD, controls, …)
orbit_visualizer/     # Python package (FastAPI server + serializer)
model/                # Optional local spacecraft assets served at /model
textures/             # Optional Earth texture assets; day texture has a generated fallback
```

## Development

```bash
# Run the Python backend (terminal 1)
uvicorn orbit_visualizer.main:app --reload --port 8000

# Run the Vite dev server with HMR (terminal 2)
npm run dev           # opens http://localhost:5173, proxies /viz-data → :8000
```

Type-check without building:

```bash
npm run typecheck
```

## License

Apache-2.0 — see [LICENSE](LICENSE).
