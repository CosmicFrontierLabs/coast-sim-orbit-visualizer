from types import SimpleNamespace
import unittest

from orbit_visualizer.serializer import (
    _extract_attitude_arrays,
    _extract_solar_panel_config,
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


if __name__ == "__main__":
    unittest.main()
