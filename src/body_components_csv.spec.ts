import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { bodyComponentsCsv } from "./body_components_csv";
import type { BodyDirectionSample } from "./plan_stats";

const sample: BodyDirectionSample = {
  time: 1_772_388_000,
  durationSec: 60,
  mode: "SCIENCE, SETTLED",
  inEclipse: false,
  sunBody: [0.1, 0.2, 0.3],
  earthBody: [-0.4, -0.5, -0.6],
  earthAngularRadiusDeg: 67.25,
};

describe("bodyComponentsCsv", () => {
  it("exports the selected source with explicit interval timing and context", () => {
    const lines = bodyComponentsCsv([sample], "sun").split("\n");

    assert.equal(
      lines[0],
      "sample_start_unix_s,sample_start_utc,sample_end_unix_s,sample_end_utc,duration_s,source,acs_mode,in_eclipse,body_x_direction_cosine,body_y_direction_cosine,body_z_direction_cosine,earth_angular_radius_deg",
    );
    assert.equal(
      lines[1],
      '1772388000,2026-03-01T18:00:00.000Z,1772388060,2026-03-01T18:01:00.000Z,60,sun,"SCIENCE, SETTLED",false,0.1,0.2,0.3,67.25',
    );
  });

  it("uses Earth components for the Earth chart export", () => {
    const row = bodyComponentsCsv([sample], "earth").split("\n")[1];

    assert.match(row, /,earth,/);
    assert.match(row, /,-0\.4,-0\.5,-0\.6,67\.25$/);
  });
});
