from types import SimpleNamespace
import unittest

from orbit_visualizer.serializer import (
    _extract_attitude_arrays,
    _extract_attitude_quaternion_arrays,
    _extract_constraint_config,
    _extract_ground_station_config,
    _gsp_station_codes,
    _extract_solar_panel_config,
    _serialize_plan_entry_for_viz,
)


class SerializerTests(unittest.TestCase):
    def test_extracts_fixed_panel_from_solar_panel_set(self) -> None:
        ditl = SimpleNamespace(
            config=SimpleNamespace(
                solar_panel=SimpleNamespace(
                    panels=[
                        SimpleNamespace(
                            gimbled=False,
                            normal=[0.0, 0.0, -2.0],
                        ),
                    ],
                ),
            ),
        )

        self.assertEqual(
            _extract_solar_panel_config(ditl),
            {"gimbled": False, "direction_sc": [0.0, 0.0, -1.0]},
        )

    def test_extracts_sun_keepout_with_eclipse_gate(self) -> None:
        ditl = SimpleNamespace(
            config=SimpleNamespace(
                constraint=SimpleNamespace(
                    earth_constraint=SimpleNamespace(min_angle=20.0),
                    sun_constraint=SimpleNamespace(
                        type="and",
                        constraints=[
                            SimpleNamespace(type="sun", min_angle=80.0),
                            SimpleNamespace(
                                type="not",
                                constraint=SimpleNamespace(
                                    type="eclipse",
                                    umbra_only=True,
                                ),
                            ),
                        ],
                    ),
                ),
            ),
        )

        self.assertEqual(
            _extract_constraint_config(ditl),
            {
                "earth_limb_min_angle_deg": 20.0,
                "sun_min_angle_deg": 80.0,
                "sun_constraint_disabled_in_eclipse": True,
                "sun_constraint_eclipse_umbra_only": True,
            },
        )

    def test_extracts_ground_station_locations(self) -> None:
        ditl = SimpleNamespace(
            config=SimpleNamespace(
                ground_stations=SimpleNamespace(
                    stations=[
                        SimpleNamespace(
                            code="tro",
                            name="Tromso",
                            latitude_deg=69.65,
                            longitude_deg=18.96,
                            elevation_m=0.0,
                            min_elevation_deg=10.0,
                        ),
                        SimpleNamespace(
                            code="NBO",
                            name="Nairobi",
                            latitude_deg=-1.2921,
                            longitude_deg=36.8219,
                        ),
                        SimpleNamespace(code="bad", latitude_deg="nan", longitude_deg=0),
                    ],
                ),
            ),
        )

        self.assertEqual(
            _extract_ground_station_config(ditl, station_codes={"TRO"}),
            [
                {
                    "code": "TRO",
                    "name": "Tromso",
                    "latitude_deg": 69.65,
                    "longitude_deg": 18.96,
                    "elevation_m": 0.0,
                    "min_elevation_deg": 10.0,
                },
            ],
        )

    def test_gsp_station_codes_are_normalized_from_plan_entries(self) -> None:
        self.assertEqual(
            _gsp_station_codes(
                [
                    {"obstype": "GSP", "station": "tro"},
                    {"obstype": "AT", "station": "SGS"},
                    {"obstype": "GSP", "station": " SGS "},
                ]
            ),
            {"TRO", "SGS"},
        )

    def test_roll_wrap_preserves_body_roll_without_180_degree_offset(self) -> None:
        ditl = SimpleNamespace(
            telemetry=SimpleNamespace(
                housekeeping=[
                    SimpleNamespace(timestamp=0.0, ra=0.0, dec=0.0, roll=286.0),
                    SimpleNamespace(timestamp=10.0, ra=0.0, dec=0.0, roll=53.0),
                    SimpleNamespace(timestamp=20.0, ra=0.0, dec=0.0, roll=180.0),
                ],
            ),
        )

        _, _, roll = _extract_attitude_arrays(ditl, [0.0, 10.0, 20.0])

        self.assertAlmostEqual(roll[0], -74.0)
        self.assertAlmostEqual(roll[1], 53.0)
        self.assertAlmostEqual(roll[2], 180.0)

    def test_extracts_attitude_quaternions_with_slerp(self) -> None:
        ditl = SimpleNamespace(
            telemetry=SimpleNamespace(
                housekeeping=[
                    SimpleNamespace(
                        timestamp=0.0,
                        quat_w=1.0,
                        quat_x=0.0,
                        quat_y=0.0,
                        quat_z=0.0,
                    ),
                    SimpleNamespace(
                        timestamp=10.0,
                        quat_w=-0.7071067811865476,
                        quat_x=0.0,
                        quat_y=0.0,
                        quat_z=-0.7071067811865475,
                    ),
                ],
            ),
        )

        quat_w, quat_x, quat_y, quat_z = _extract_attitude_quaternion_arrays(
            ditl, [0.0, 5.0, 10.0]
        )

        self.assertAlmostEqual(quat_w[0], 1.0)
        self.assertAlmostEqual(quat_x[1], 0.0)
        self.assertAlmostEqual(quat_y[1], 0.0)
        self.assertAlmostEqual(quat_w[1], 0.9238795325)
        self.assertAlmostEqual(quat_z[1], 0.3826834324)
        self.assertAlmostEqual(quat_w[2], -0.7071067811865476)
        self.assertAlmostEqual(quat_z[2], -0.7071067811865475)

    def test_ppst_preserves_gsp_tracking_fields(self) -> None:
        entry = _serialize_plan_entry_for_viz({
            "begin": 10,
            "end": 20,
            "ra": 23.418,
            "dec": 21.232,
            "roll": 0.0,
            "name": "TRO_PASS",
            "obstype": "GSP",
            "station": "TRO",
            "slewtime": 240,
            "slewdist": 12.5,
            "exposure": 480,
            "contact_begin": "1970-01-01T00:02:00+00:00",
            "contact_end": "1970-01-01T00:10:00+00:00",
            "track_start_ra": 23.418,
            "track_start_dec": 21.232,
            "track_end_ra": 231.672,
            "track_end_dec": -0.379,
        })

        self.assertIsNotNone(entry)
        assert entry is not None
        self.assertEqual(entry["station"], "TRO")
        self.assertEqual(entry["slewtime"], 240.0)
        self.assertEqual(entry["slewdist"], 12.5)
        self.assertEqual(entry["exposure"], 480.0)
        self.assertEqual(entry["contact_begin"], 120.0)
        self.assertEqual(entry["contact_end"], 600.0)
        self.assertEqual(entry["track_start_ra"], 23.418)
        self.assertEqual(entry["track_start_dec"], 21.232)
        self.assertEqual(entry["track_end_ra"], 231.672)
        self.assertEqual(entry["track_end_dec"], -0.379)


if __name__ == "__main__":
    unittest.main()
