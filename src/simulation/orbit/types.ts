export interface Orbit {
    semiMajorAxis: number; // in kilometers
    eccentricity: number; // unitless
    inclination: number; // in degrees
    rightAscension: number; // in degrees
    argumentOfPeriapsis: number; // in degrees
    trueAnomaly: number; // in degrees
}

export interface StateVector {
    position: [number, number, number]; // in kilometers
    velocity: [number, number, number]; // in kilometers per second
}

export interface PropagationOptions {
    timeStep: number; // in seconds
    duration: number; // in seconds
    usePerturbations: boolean; // whether to include perturbations in the calculations
}