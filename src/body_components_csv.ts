import type { BodyDirectionSample } from "./plan_stats";
import { csvRows } from "./csv";

export type BodyComponentSource = "sun" | "earth";

/** Serialize the samples shown in the Body Components chart. */
export function bodyComponentsCsv(
  samples: BodyDirectionSample[],
  source: BodyComponentSource,
): string {
  const headers = [
    "sample_start_unix_s",
    "sample_start_utc",
    "sample_end_unix_s",
    "sample_end_utc",
    "duration_s",
    "source",
    "acs_mode",
    "in_eclipse",
    "body_x_direction_cosine",
    "body_y_direction_cosine",
    "body_z_direction_cosine",
    "earth_angular_radius_deg",
  ];
  const rows = samples.map((sample) => {
    const endTime = sample.time + sample.durationSec;
    const components = source === "sun" ? sample.sunBody : sample.earthBody;
    return [
      sample.time,
      new Date(sample.time * 1000).toISOString(),
      endTime,
      new Date(endTime * 1000).toISOString(),
      sample.durationSec,
      source,
      sample.mode,
      sample.inEclipse,
      ...components,
      sample.earthAngularRadiusDeg,
    ];
  });

  return csvRows(headers, rows);
}
