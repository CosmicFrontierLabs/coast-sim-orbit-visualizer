"""Serialize a completed DITL simulation object into a JSON-serializable dict."""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from conops.ditl import DITL


def ditl_to_payload(ditl: "DITL") -> dict:
    """Convert a post-``calc()`` DITL object into a JSON-serializable dict.

    Returns
    -------
    dict with keys:
        meta        – mission metadata (name, begin/end, step_size, TLE strings)
        trajectory  – list of ``{t, x, y, z}`` ECI position records (km)
        telemetry   – list of Housekeeping records (ra, dec, roll, mode, power, …)
        plan        – PlanSchema JSON (scheduled observations)
    """
    return {
        "meta": _serialize_meta(ditl),
        "trajectory": _serialize_trajectory(ditl),
        "telemetry": _serialize_telemetry(ditl),
        "plan": _serialize_plan(ditl),
    }


def _serialize_meta(ditl: "DITL") -> dict:
    return {
        "mission": ditl.config.name,
        "begin": ditl.begin.isoformat(),
        "end": ditl.end.isoformat(),
        "step_size": ditl.step_size,
        "tle1": getattr(ditl.ephem, "tle1", None),
        "tle2": getattr(ditl.ephem, "tle2", None),
    }


def _serialize_trajectory(ditl: "DITL") -> list[dict]:
    """Extract GCRS (ECI) spacecraft position from the ephemeris at full resolution."""
    gcrs = ditl.ephem.gcrs
    timestamps = [ts.timestamp() for ts in ditl.ephem.timestamp]
    x = gcrs.cartesian.x.to_value("km").tolist()
    y = gcrs.cartesian.y.to_value("km").tolist()
    z = gcrs.cartesian.z.to_value("km").tolist()
    return [
        {"t": t, "x": xi, "y": yi, "z": zi}
        for t, xi, yi, zi in zip(timestamps, x, y, z)
    ]


def _serialize_telemetry(ditl: "DITL") -> list[dict]:
    """Serialize Housekeeping records from ``ditl.telemetry.housekeeping``."""
    result = []
    for hk in ditl.telemetry.housekeeping:
        record = hk.model_dump(mode="json")
        # Ensure ACSMode enum serializes to its name string
        if "acs_mode" in record and hasattr(hk.acs_mode, "name"):
            record["acs_mode"] = hk.acs_mode.name
        result.append(record)
    return result


def _serialize_plan(ditl: "DITL") -> dict:
    from conops.targets.plan_schema import PlanSchema

    return PlanSchema.from_plan(ditl.plan).model_dump(mode="json")


# ---------------------------------------------------------------------------
# VizData payload (3-D frontend format)
# ---------------------------------------------------------------------------

RE_KM = 6371.0


def ditl_to_viz_payload(ditl: "DITL") -> dict:
    """Convert a post-``calc()`` DITL object into the VizData JSON consumed by
    the Three.js orbit visualizer frontend.

    Returns
    -------
    dict matching the VizData TypeScript interface:
        meta     – { n_ephem, n_ppst, n_slews, mission }
        ephem    – { utime, posvec, sunvec, ramvec, polevec, lat, lon, beta, ineclipse }
        ppst     – list of { begin, end, ra, dec, roll, name }
        slews    – [] (slew interpolation not currently extracted)
    """
    import numpy as np
    from astropy.coordinates import get_sun
    from astropy.time import Time

    gcrs = ditl.ephem.gcrs
    timestamps = [ts.timestamp() for ts in ditl.ephem.timestamp]
    n = len(timestamps)

    x = gcrs.cartesian.x.to_value("km")
    y = gcrs.cartesian.y.to_value("km")
    z = gcrs.cartesian.z.to_value("km")
    posvec = [[float(x[i]), float(y[i]), float(z[i])] for i in range(n)]

    # Velocity → RAM direction (finite differences, km/s)
    t_arr = np.asarray(timestamps, dtype=float)
    vx = np.gradient(x, t_arr)
    vy = np.gradient(y, t_arr)
    vz = np.gradient(z, t_arr)
    speed = np.sqrt(vx**2 + vy**2 + vz**2)
    speed = np.where(speed < 1e-12, 1.0, speed)
    ramvec = [[float(vx[i] / speed[i]), float(vy[i] / speed[i]), float(vz[i] / speed[i])] for i in range(n)]

    # Sun unit vector in ECI (GCRS) from astropy
    ap_times = Time(timestamps, format="unix", scale="utc")
    sun_sc = get_sun(ap_times).gcrs  # type: ignore[attr-defined]
    sx = np.asarray(sun_sc.cartesian.x.value, dtype=float)
    sy = np.asarray(sun_sc.cartesian.y.value, dtype=float)
    sz = np.asarray(sun_sc.cartesian.z.value, dtype=float)
    sr = np.sqrt(sx**2 + sy**2 + sz**2)
    sr = np.where(sr < 1e-12, 1.0, sr)
    sunvec = [[float(sx[i] / sr[i]), float(sy[i] / sr[i]), float(sz[i] / sr[i])] for i in range(n)]

    # Geodetic lat/lon via ITRS transform
    try:
        itrs = gcrs.itrs
        lat = itrs.earth_location.lat.deg.tolist()  # type: ignore[union-attr]
        lon = itrs.earth_location.lon.deg.tolist()  # type: ignore[union-attr]
    except Exception:
        lat = [0.0] * n
        lon = [0.0] * n

    # Eclipse: cylindrical shadow model
    pos_arr = np.column_stack([x, y, z])
    sun_arr = np.column_stack([sx / sr, sy / sr, sz / sr])
    anti_sun = -sun_arr
    proj = np.sum(pos_arr * anti_sun, axis=1)
    perp_dist = np.sqrt(np.sum((pos_arr - proj[:, None] * anti_sun) ** 2, axis=1))
    ineclipse = ((proj > 0) & (perp_dist < RE_KM)).astype(float).tolist()

    # Beta angle: arcsin(dot(orbit_normal_unit, sun_unit))
    ram_arr = np.column_stack([vx / speed, vy / speed, vz / speed])
    orbit_cross = np.cross(pos_arr, ram_arr)
    orbit_norm = np.linalg.norm(orbit_cross, axis=1, keepdims=True)
    orbit_norm = np.where(orbit_norm < 1e-12, 1.0, orbit_norm)
    orbit_normal = orbit_cross / orbit_norm
    beta = np.degrees(np.arcsin(np.clip(np.sum(orbit_normal * sun_arr, axis=1), -1.0, 1.0))).tolist()
    polevec = orbit_normal.tolist()

    ephem = {
        "utime": timestamps,
        "posvec": posvec,
        "sunvec": sunvec,
        "ramvec": ramvec,
        "polevec": polevec,
        "lat": lat,
        "lon": lon,
        "beta": beta,
        "ineclipse": ineclipse,
    }

    ppst = _serialize_ppst_for_viz(ditl)
    return {
        "meta": {
            "n_ephem": n,
            "n_ppst": len(ppst),
            "n_slews": 0,
            "mission": getattr(getattr(ditl, "config", None), "name", "SC"),
        },
        "ephem": ephem,
        "ppst": ppst,
        "slews": [],
    }


def _serialize_ppst_for_viz(ditl: "DITL") -> list[dict]:
    """Extract PPST-style observation entries from the DITL plan."""
    from conops.targets.plan_schema import PlanSchema

    plan_dict = PlanSchema.from_plan(ditl.plan).model_dump(mode="json")
    entries = plan_dict.get("entries", [])
    ppst = []
    for e in entries:
        begin = _to_unix(e.get("begin"))
        end = _to_unix(e.get("end"))
        if begin is None or end is None or end <= begin:
            continue
        ppst.append({
            "begin": begin,
            "end": end,
            "ra": float(e.get("ra", 0.0)),
            "dec": float(e.get("dec", 0.0)),
            "roll": float(e.get("roll", 0.0)),
            "name": str(e.get("name", "")),
        })
    return ppst


def _to_unix(v: object) -> float | None:
    """Convert a datetime-like value (ISO string, datetime, or float) to a Unix timestamp."""
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, str):
        from datetime import datetime, timezone

        try:
            dt = datetime.fromisoformat(v)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt.timestamp()
        except ValueError:
            return None
    if hasattr(v, "timestamp"):
        return float(v.timestamp())  # type: ignore[union-attr]
    return None
