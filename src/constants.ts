declare global {
	interface Window {
		VIZ_ASSET_BASE?: string;
	}
}

export const RE_KM = 6371.0;
export const RE_M = RE_KM * 1000;
export const SCALE = 1.0 / RE_KM; // 1 world-unit = 1 Earth radius
export const SUN_DIST = 60; // display-only sun distance (world units)
export const SPEEDS = [1, 10, 30, 60, 120, 300, 600, 1200]; // sim seconds per real second
export const DEG = Math.PI / 180;
export const SC_DIAG_M = 6.0; // approx mini-van scale
export const SC_DIAG_WU = SC_DIAG_M / RE_M;
export const SC_SCREEN_FRACTION = 0.2; // target default width occupancy
export const CAMERA_MIN_FAR = 90;
export const CAMERA_NEAR_FRAC = 0.03;
export const CAMERA_FAR_PAD = 80;

// Custom vector geometry (line + cone), independent shaft/head tuning.
export const SC_AXIS_SHAFT_LEN = SC_DIAG_WU * 2.0;
export const SC_VEL_SHAFT_LEN = SC_DIAG_WU * 2.0;
export const SC_SUN_VEC_SHAFT_LEN = SC_DIAG_WU * 2.0;
export const SC_HEAD_LEN = SC_DIAG_WU * 0.4;
export const SC_HEAD_W = SC_DIAG_WU * 0.1;

export const LINK_TRAIL_WU = 75.0 / RE_M; // Link trails spacecraft by 75 meters
export const LINK_SIZE_WU = SC_DIAG_WU * 0.7;
export const PANEL_MESH_TRIM_DEG = 0.0; // Keep neutral; geometric calibration handles alignment

// Earth/moon display parameters.
export const CLOUD_TOP_KM = 12.0;
export const ATM_GLOW_TOP_KM = 95.0;
export const CLOUD_RADIUS = 1 + CLOUD_TOP_KM / RE_KM;
export const ATM_RADIUS = 1 + ATM_GLOW_TOP_KM / RE_KM;
export const MOON_RADIUS_WU = 1737.4 / RE_KM;
export const MOON_ORBIT_RADIUS_WU = 384400.0 / RE_KM;
export const MOON_ORBIT_PERIOD_S = 27.321661 * 86400;
export const MOON_INCLINATION_RAD = 5.145 * DEG;
export const MOON_NODE_RAD = 125.08 * DEG;
export const MOON_EPOCH_UNIX = 946727935.816; // J2000 reference epoch

// Use same-path asset base by default so API calls resolve under /viz/ when reverse-proxied.
export const ASSET_BASE = window.VIZ_ASSET_BASE ?? "./";

export {};
