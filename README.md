# Orbit Visualizer

Visualize spacecraft orbits and telemetry from a [COASTSim](../README.md) DITL simulation.

## Installation

```bash
# Python dependencies (from the repo root)
pip install -e ".[dev]"
pip install -r orbit-visualizer/backend/requirements.txt

# TypeScript frontend
cd orbit-visualizer
npm install && npm run build
```

## Usage

After running a DITL simulation, pass the completed object to `launch()`:

```python
from orbit_visualizer.backend import launch

ditl.calc()
launch(ditl)
```

This starts a local server and opens the visualization in your browser at **http://localhost:8000**.

### Options

```python
launch(ditl, port=8001)             # use a different port
launch(ditl, open_browser=False)    # don't open browser automatically
launch(ditl, blocking=True)         # block until the server exits (for scripts)
```

The `orbit_visualizer` package is included in the main `coast-sim` install — no separate install step needed after `pip install -e .` from the repo root.
```

## What you can see

The visualizer shows:

- **Orbit trajectory** — the spacecraft's 3-D path in ECI coordinates
- **Pointing direction** — where the spacecraft is pointed at each timestep (RA/Dec/Roll)
- **ACS mode** — Science, Slewing, Safe, SAA, Ground Pass, etc.
- **Power & battery** — solar panel illumination, power draw, battery state of charge
- **Data management** — onboard recorder fill fraction
- **Eclipse** — when the spacecraft is in Earth's shadow

This project is licensed under the MIT License. See the LICENSE file for details.
