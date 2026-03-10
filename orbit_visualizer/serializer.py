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
