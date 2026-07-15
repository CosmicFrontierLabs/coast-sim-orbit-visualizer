#!/usr/bin/env bash
#
# Launch the orbit visualizer. The plan payload is sourced by the visualizer
# itself from a path or URI — no data-plane logic (S3 client, credentials,
# copy step) lives in this container.
#
# Plan data (required):
#   VIZ_DATA_URI   Path or URI to viz_data.json. Passed to --viz-data. Accepts
#                  file://, http://, https:// (public URLs need no credentials)
#                  or a local path (e.g. a mounted file). Example:
#                  https://<bucket>.s3.<region>.amazonaws.com/tamalpais/viz/latest/viz_data.json
#                  (Alternatively set ORBIT_VISUALIZER_VIZ_DATA, which the
#                  visualizer reads directly; then VIZ_DATA_URI may be omitted.)
#
# Spacecraft model (optional):
#   MODEL_DIR      Local directory of spacecraft assets (spacecraft.glb and,
#                  when needed, spacecraft.config.json), served at /model. Mount
#                  it into the container. Passed to --model-dir when set.
#
# Server overrides:
#   ORBIT_VIS_HOST       bind host      (default 0.0.0.0)
#   ORBIT_VIS_PORT       bind port      (default 8000)
#   ORBIT_VIS_LOG_LEVEL  uvicorn level  (default info)
#
set -euo pipefail

args=()

if [[ -n "${VIZ_DATA_URI:-}" ]]; then
  args+=(--viz-data "${VIZ_DATA_URI}")
elif [[ -z "${ORBIT_VISUALIZER_VIZ_DATA:-}" ]]; then
  echo "entrypoint: ERROR — no viz data configured." >&2
  echo "            Set VIZ_DATA_URI to a path or URI (file://, http://, https://)," >&2
  echo "            or set ORBIT_VISUALIZER_VIZ_DATA. Example:" >&2
  echo "            VIZ_DATA_URI=https://<bucket>/tamalpais/viz/latest/viz_data.json" >&2
  exit 1
fi

if [[ -n "${MODEL_DIR:-}" ]]; then
  args+=(--model-dir "${MODEL_DIR}")
fi

exec python -m orbit_visualizer.cli \
  "${args[@]}" \
  --host "${ORBIT_VIS_HOST:-0.0.0.0}" \
  --port "${ORBIT_VIS_PORT:-8000}" \
  --log-level "${ORBIT_VIS_LOG_LEVEL:-info}"
