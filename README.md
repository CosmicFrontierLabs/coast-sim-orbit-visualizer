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

```python
from orbit_visualizer import launch

ditl.calc()
launch(ditl)          # starts server + opens http://localhost:8000
```

### Options

```python
launch(ditl, port=8001)             # custom port
launch(ditl, open_browser=False)    # don't open browser automatically
launch(ditl, blocking=True)         # block until server exits (useful in scripts)
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

## Project layout

```text
app/                  # Vite entry point (index.html, orbit_viz.ts, CSS)
src/                  # TypeScript modules (Three.js scene, HUD, controls, …)
orbit_visualizer/     # Python package (FastAPI server + serializer)
model/                # Spacecraft GLTF model
textures/             # Earth day/night/cloud textures
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
