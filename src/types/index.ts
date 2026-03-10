export type Orbit = {
    semiMajorAxis: number;
    eccentricity: number;
    inclination: number;
    raan: number; // Right Ascension of Ascending Node
    argumentOfPeriapsis: number;
    trueAnomaly: number;
};

export type StateVector = {
    position: [number, number, number]; // x, y, z coordinates
    velocity: [number, number, number]; // vx, vy, vz components
};

export type PropagationOptions = {
    timeStep: number;
    duration: number;
    method: 'RK4' | 'Euler'; // Example methods for propagation
};

export type SpacecraftData = {
    id: string;
    name: string;
    mass: number;
    dimensions: [number, number, number]; // length, width, height
};

export type VisualizationOptions = {
    showOrbit: boolean;
    showLabels: boolean;
    backgroundColor: string;
};