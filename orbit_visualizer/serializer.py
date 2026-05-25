"""Serialize a completed DITL simulation object into a JSON-serializable dict."""

from __future__ import annotations

from collections.abc import Mapping
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


def _normalize_vec3(v: object) -> list[float] | None:
    """Return a normalized 3-vector when *v* can be interpreted as xyz."""
    import math

    if v is None:
        return None

    # Axis shorthand strings such as +X, -Y, +Z
    if isinstance(v, str):
        s = v.strip().upper().replace(" ", "")
        axis_map = {
            "X": [1.0, 0.0, 0.0],
            "+X": [1.0, 0.0, 0.0],
            "-X": [-1.0, 0.0, 0.0],
            "Y": [0.0, 1.0, 0.0],
            "+Y": [0.0, 1.0, 0.0],
            "-Y": [0.0, -1.0, 0.0],
            "Z": [0.0, 0.0, 1.0],
            "+Z": [0.0, 0.0, 1.0],
            "-Z": [0.0, 0.0, -1.0],
        }
        return axis_map.get(s)

    xyz: list[float] | None = None
    if isinstance(v, Mapping):
        if all(k in v for k in ("x", "y", "z")):
            xyz = [float(v["x"]), float(v["y"]), float(v["z"])]
    elif isinstance(v, (list, tuple)) and len(v) == 3:
        xyz = [float(v[0]), float(v[1]), float(v[2])]
    elif all(hasattr(v, a) for a in ("x", "y", "z")):
        xyz = [float(getattr(v, "x")), float(getattr(v, "y")), float(getattr(v, "z"))]

    if xyz is None:
        return None

    norm = math.sqrt(xyz[0] ** 2 + xyz[1] ** 2 + xyz[2] ** 2)
    if norm < 1e-12:
        return None
    return [xyz[0] / norm, xyz[1] / norm, xyz[2] / norm]


def _get_field(obj: object, names: tuple[str, ...]) -> object | None:
    if obj is None:
        return None
    if isinstance(obj, Mapping):
        for n in names:
            if n in obj:
                return obj[n]
        return None
    for n in names:
        if hasattr(obj, n):
            return getattr(obj, n)
    return None


def _constraint_type(obj: object) -> str | None:
    raw_type = _get_field(obj, ("type",))
    return str(raw_type).lower() if raw_type is not None else None


def _iter_constraint_tree(obj: object) -> list[object]:
    if obj is None:
        return []

    nodes = [obj]
    children = _get_field(obj, ("constraints",))
    if isinstance(children, Mapping):
        for child in children.values():
            nodes.extend(_iter_constraint_tree(child))
    elif isinstance(children, (list, tuple)):
        for child in children:
            nodes.extend(_iter_constraint_tree(child))

    child = _get_field(obj, ("constraint",))
    if child is not None:
        nodes.extend(_iter_constraint_tree(child))

    return nodes


def _extract_sun_constraint_config(constraint: object) -> dict | None:
    sun_constraint = _get_field(constraint, ("sun_constraint",))
    if sun_constraint is None:
        return None

    nodes = _iter_constraint_tree(sun_constraint)
    sun_min_angle = None
    disabled_in_eclipse = False
    eclipse_umbra_only = None

    for node in nodes:
        node_type = _constraint_type(node)
        if node_type == "sun" and sun_min_angle is None:
            min_angle = _get_field(node, ("min_angle", "min_angle_deg"))
            if min_angle is not None:
                sun_min_angle = min_angle
        if node_type == "not":
            child = _get_field(node, ("constraint",))
            if _constraint_type(child) == "eclipse":
                disabled_in_eclipse = True
                eclipse_umbra_only = _get_field(child, ("umbra_only",))

    if sun_min_angle is None:
        return None

    try:
        out = {"sun_min_angle_deg": float(sun_min_angle)}
    except (TypeError, ValueError):
        return None

    if disabled_in_eclipse:
        out["sun_constraint_disabled_in_eclipse"] = True
    if eclipse_umbra_only is not None:
        out["sun_constraint_eclipse_umbra_only"] = bool(eclipse_umbra_only)
    return out


def _extract_solar_panel_config(ditl: "DITL") -> dict | None:
    """Extract canonical panel config from DITL config when available."""
    cfg = getattr(ditl, "config", None)
    if cfg is None:
        return None

    candidates: list[object] = []

    def push(obj: object) -> None:
        if obj is None:
            return
        if isinstance(obj, (list, tuple)):
            candidates.extend(item for item in obj if item is not None)
            return
        candidates.append(obj)
        panels = _get_field(obj, ("panels",))
        if isinstance(panels, Mapping):
            candidates.extend(item for item in panels.values() if item is not None)
        elif isinstance(panels, (list, tuple)):
            candidates.extend(item for item in panels if item is not None)
        elif panels is not None:
            candidates.append(panels)

    push(_get_field(cfg, ("solar_panel", "solar_panels", "panel", "panels")))
    sc_cfg = _get_field(cfg, ("spacecraft", "satellite", "bus", "vehicle"))
    if sc_cfg is not None:
        push(sc_cfg)
        push(_get_field(sc_cfg, ("solar_panel", "solar_panels", "panel", "panels")))

    gimbled: bool | None = None
    direction_sc: list[float] | None = None

    for obj in candidates:
        g_raw = _get_field(
            obj,
            (
                "gimbled",
                "is_gimbled",
                "gimbal",
                "is_gimbal",
                "sun_tracking",
                "track_sun",
            ),
        )
        if g_raw is not None and gimbled is None:
            try:
                gimbled = bool(g_raw)
            except Exception:
                pass

        d_raw = _get_field(
            obj,
            (
                "direction_sc",
                "fixed_direction",
                "direction",
                "normal",
                "panel_normal",
                "vector",
            ),
        )
        if d_raw is not None and direction_sc is None:
            direction_sc = _normalize_vec3(d_raw)

        if gimbled is not None and direction_sc is not None:
            break

    if gimbled is None and direction_sc is None:
        return None

    out: dict = {}
    if gimbled is not None:
        out["gimbled"] = gimbled
    if direction_sc is not None:
        out["direction_sc"] = direction_sc
    return out


def _extract_constraint_config(ditl: "DITL") -> dict | None:
    """Extract schedule constraint values needed by frontend plan checks."""
    cfg = getattr(ditl, "config", None)
    constraint = _get_field(cfg, ("constraint", "constraints"))
    if constraint is None:
        return None

    earth_constraint = _get_field(constraint, ("earth_constraint", "earth_limb_constraint"))
    earth_min_angle = _get_field(earth_constraint, ("min_angle", "min_angle_deg"))

    out: dict = {}
    sun_cfg = _extract_sun_constraint_config(constraint)
    if sun_cfg is not None:
        out.update(sun_cfg)

    if earth_min_angle is not None:
        try:
            out["earth_limb_min_angle_deg"] = float(earth_min_angle)
        except (TypeError, ValueError):
            pass

    return out or None


def _extract_ground_station_config(
    ditl: "DITL", station_codes: set[str] | None = None
) -> list[dict] | None:
    """Extract plan-referenced ground station locations needed by the frontend."""
    import math

    cfg = getattr(ditl, "config", None)
    registry = _get_field(
        cfg,
        (
            "ground_stations",
            "ground_station_registry",
            "groundstation_registry",
        ),
    )
    stations = _get_field(registry, ("stations",))
    if stations is None:
        return None

    if isinstance(stations, Mapping):
        station_iter = stations.values()
    elif isinstance(stations, (list, tuple)):
        station_iter = stations
    else:
        return None

    out: list[dict] = []
    for station in station_iter:
        code = _get_field(station, ("code", "id"))
        lat = _get_field(station, ("latitude_deg", "lat_deg", "latitude", "lat"))
        lon = _get_field(station, ("longitude_deg", "lon_deg", "longitude", "lon"))
        if code is None or lat is None or lon is None:
            continue

        code_norm = str(code).strip().upper()
        if station_codes is not None and code_norm not in station_codes:
            continue

        try:
            lat_f = float(lat)
            lon_f = float(lon)
        except (TypeError, ValueError):
            continue
        if not (math.isfinite(lat_f) and math.isfinite(lon_f)):
            continue

        entry: dict = {
            "code": code_norm,
            "latitude_deg": lat_f,
            "longitude_deg": lon_f,
        }
        name = _get_field(station, ("name",))
        if name is not None:
            entry["name"] = str(name)

        elevation = _get_field(station, ("elevation_m", "elevation"))
        if elevation is not None:
            try:
                elevation_f = float(elevation)
                if math.isfinite(elevation_f):
                    entry["elevation_m"] = elevation_f
            except (TypeError, ValueError):
                pass

        min_elevation = _get_field(station, ("min_elevation_deg", "min_elevation"))
        if min_elevation is not None:
            try:
                min_elevation_f = float(min_elevation)
                if math.isfinite(min_elevation_f):
                    entry["min_elevation_deg"] = min_elevation_f
            except (TypeError, ValueError):
                pass

        out.append(entry)

    return out or None


def _gsp_station_codes(entries: list[dict]) -> set[str]:
    return {
        str(entry["station"]).strip().upper()
        for entry in entries
        if str(entry.get("obstype", "")).upper() == "GSP" and entry.get("station")
    }


def ditl_to_viz_payload(ditl: "DITL") -> dict:
    """Convert a post-``calc()`` DITL object into the VizData JSON consumed by
    the Three.js orbit visualizer frontend.

    Returns
    -------
    dict matching the VizData TypeScript interface:
        meta     – { n_ephem, n_ppst, n_slews, mission, ground_stations? }
        ephem    – { utime, posvec, sunvec, ramvec, polevec, lat, lon, beta, ineclipse }
        ppst     – list of { begin, end, ra, dec, roll, name, obstype?, station?,
                   slewtime?, slewdist?, exposure?, contact_begin?, contact_end?,
                   track_start_ra?, track_start_dec?, track_end_ra?, track_end_dec? }
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

    # Attempt to add actual spacecraft attitude from DITL telemetry.
    # Falls back gracefully if housekeeping records are absent or malformed.
    try:
        ra_arr, dec_arr, roll_arr = _extract_attitude_arrays(ditl, timestamps)
        ephem["ra"] = ra_arr
        ephem["dec"] = dec_arr
        ephem["roll"] = roll_arr
    except Exception:
        pass  # Frontend falls back to ram-aligned attitude.

    try:
        quat_w, quat_x, quat_y, quat_z = _extract_attitude_quaternion_arrays(
            ditl, timestamps
        )
        ephem["quat_w"] = quat_w
        ephem["quat_x"] = quat_x
        ephem["quat_y"] = quat_y
        ephem["quat_z"] = quat_z
    except Exception:
        pass  # Frontend falls back to RA/Dec/Roll attitude.

    ppst = _serialize_ppst_for_viz(ditl)
    solar_panel_cfg = _extract_solar_panel_config(ditl)
    constraint_cfg = _extract_constraint_config(ditl)
    ground_station_cfg = _extract_ground_station_config(
        ditl,
        station_codes=_gsp_station_codes(ppst),
    )

    meta: dict = {
        "n_ephem": n,
        "n_ppst": len(ppst),
        "n_slews": 0,
        "mission": getattr(getattr(ditl, "config", None), "name", "SC"),
    }
    if solar_panel_cfg is not None:
        meta["solar_panel"] = solar_panel_cfg
    if constraint_cfg is not None:
        meta["constraints"] = constraint_cfg
    if ground_station_cfg is not None:
        meta["ground_stations"] = ground_station_cfg

    return {
        "meta": meta,
        "ephem": ephem,
        "ppst": ppst,
        "slews": [],
    }


def _extract_attitude_arrays(
    ditl: "DITL", target_times: list[float]
) -> tuple[list[float], list[float], list[float]]:
    """Interpolate RA/Dec/Roll from DITL telemetry housekeeping onto *target_times*.

    Uses ``numpy.unwrap`` to handle angle wrap-around before linear interpolation,
    then normalises into the conventional ranges:
    * RA  → [0, 360)
    * Dec → unclamped (linear in degrees)
    * Roll → (-180, 180]
    """
    import numpy as np

    hk_list = ditl.telemetry.housekeeping
    if not hk_list:
        raise ValueError("No housekeeping records in DITL telemetry")

    hk_t = np.asarray(_extract_housekeeping_times(hk_list), dtype=float)
    ra_raw = np.asarray([float(hk.ra) for hk in hk_list], dtype=float)
    dec_raw = np.asarray([float(hk.dec) for hk in hk_list], dtype=float)
    roll_raw = np.asarray([float(hk.roll) for hk in hk_list], dtype=float)

    t_out = np.asarray(target_times, dtype=float)

    # Unwrap in radians before interpolating to avoid shortest-path flips.
    ra_interp = np.interp(t_out, hk_t, np.unwrap(np.radians(ra_raw)))
    dec_interp = np.interp(t_out, hk_t, np.unwrap(np.radians(dec_raw)))
    roll_interp = np.interp(t_out, hk_t, np.unwrap(np.radians(roll_raw)))

    ra_deg = np.degrees(ra_interp) % 360.0
    dec_deg = np.degrees(dec_interp)
    roll_deg = ((np.degrees(roll_interp) + 180.0) % 360.0) - 180.0
    roll_deg = np.where(roll_deg == -180.0, 180.0, roll_deg)

    return ra_deg.tolist(), dec_deg.tolist(), roll_deg.tolist()


def _extract_housekeeping_times(hk_list: list[object]) -> list[float]:
    hk_times: list[float] = []
    for hk in hk_list:
        for attr in ("timestamp", "time", "utime", "t"):
            raw = getattr(hk, attr, None)
            if raw is not None:
                t = _to_unix(raw)
                if t is not None:
                    hk_times.append(t)
                    break
        else:
            raise ValueError(f"Cannot find a timestamp field on housekeeping record: {hk!r}")
    return hk_times


def _normalize_quat(q: object) -> object:
    import numpy as np

    q_arr = np.asarray(q, dtype=float)
    norm = float(np.linalg.norm(q_arr))
    if norm < 1e-12:
        raise ValueError("Zero-length attitude quaternion")
    return q_arr / norm


def _slerp_quat(q0: object, q1: object, f: float) -> object:
    import numpy as np

    q0_arr = _normalize_quat(q0)
    q1_arr = _normalize_quat(q1)
    dot = float(np.dot(q0_arr, q1_arr))
    if dot < 0.0:
        q1_arr = -q1_arr
        dot = -dot
    dot = min(dot, 1.0)

    if dot > 0.9995:
        return _normalize_quat(q0_arr + f * (q1_arr - q0_arr))

    theta_0 = float(np.arccos(dot))
    sin_theta_0 = float(np.sin(theta_0))
    return (
        np.sin((1.0 - f) * theta_0) * q0_arr
        + np.sin(f * theta_0) * q1_arr
    ) / sin_theta_0


def _extract_attitude_quaternion_arrays(
    ditl: "DITL", target_times: list[float]
) -> tuple[list[float], list[float], list[float], list[float]]:
    """Interpolate COAST ECI-to-body attitude quaternions onto *target_times*."""
    import math
    import numpy as np

    hk_list = ditl.telemetry.housekeeping
    if not hk_list:
        raise ValueError("No housekeeping records in DITL telemetry")

    hk_t = np.asarray(_extract_housekeeping_times(hk_list), dtype=float)
    hk_q = []
    for hk in hk_list:
        q = [
            getattr(hk, "quat_w", None),
            getattr(hk, "quat_x", None),
            getattr(hk, "quat_y", None),
            getattr(hk, "quat_z", None),
        ]
        if any(value is None for value in q):
            raise ValueError("Housekeeping record is missing attitude quaternion")
        q_f = [float(value) for value in q]
        if not all(math.isfinite(value) for value in q_f):
            raise ValueError("Housekeeping record has non-finite attitude quaternion")
        hk_q.append(_normalize_quat(q_f))
    hk_q_arr = np.asarray(hk_q, dtype=float)

    out = []
    for target_t in target_times:
        if target_t <= hk_t[0]:
            out.append(hk_q_arr[0])
            continue
        if target_t >= hk_t[-1]:
            out.append(hk_q_arr[-1])
            continue

        i0 = int(np.searchsorted(hk_t, target_t, side="right") - 1)
        i1 = min(i0 + 1, len(hk_t) - 1)
        dt = float(hk_t[i1] - hk_t[i0])
        f = 0.0 if dt <= 0.0 else float((target_t - hk_t[i0]) / dt)
        out.append(_slerp_quat(hk_q_arr[i0], hk_q_arr[i1], f))

    out_arr = np.asarray(out, dtype=float)
    return (
        out_arr[:, 0].tolist(),
        out_arr[:, 1].tolist(),
        out_arr[:, 2].tolist(),
        out_arr[:, 3].tolist(),
    )


def _serialize_ppst_for_viz(ditl: "DITL") -> list[dict]:
    """Extract PPST-style observation entries from the DITL plan."""
    from conops.targets.plan_schema import PlanSchema

    plan_dict = PlanSchema.from_plan(ditl.plan).model_dump(mode="json")
    entries = plan_dict.get("entries", [])
    return [
        entry
        for e in entries
        if (entry := _serialize_plan_entry_for_viz(e)) is not None
    ]


def _serialize_plan_entry_for_viz(e: Mapping) -> dict | None:
    begin = _to_unix(e.get("begin"))
    end = _to_unix(e.get("end"))
    if begin is None or end is None or end <= begin:
        return None

    entry = {
        "begin": begin,
        "end": end,
        "ra": float(e.get("ra", 0.0)),
        "dec": float(e.get("dec", 0.0)),
        "roll": float(e.get("roll", 0.0)),
        "name": str(e.get("name", "")),
        "obstype": str(e.get("obstype") or e.get("type") or "PPT"),
    }
    for field in ("slewtime", "slewdist", "exposure"):
        value = e.get(field)
        if value is not None:
            entry[field] = float(value)

    for source, dest in (
        ("contact_begin", "contact_begin"),
        ("contact_end", "contact_end"),
    ):
        value = _to_unix(e.get(source))
        if value is not None:
            entry[dest] = value

    for field in (
        "track_start_ra",
        "track_start_dec",
        "track_end_ra",
        "track_end_dec",
    ):
        value = e.get(field)
        if value is not None:
            entry[field] = float(value)

    station = e.get("station")
    if station:
        entry["station"] = str(station)
    return entry


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
