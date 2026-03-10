import { Renderer } from './renderer';
import { Scene } from './scene';
import { Orbit, SpacecraftData } from '../types';

export class OrbitView {
    private renderer: Renderer;
    private scene: Scene;

    constructor(renderer: Renderer, scene: Scene) {
        this.renderer = renderer;
        this.scene = scene;
    }

    public initializeOrbitVisualization(spacecraftData: SpacecraftData): void {
        this.setupOrbit(spacecraftData);
    }

    private setupOrbit(spacecraftData: SpacecraftData): void {
        const orbitPath = this.calculateOrbitPath(spacecraftData);
        this.scene.addObject(orbitPath);
    }

    private calculateOrbitPath(_spacecraftData: SpacecraftData): Orbit {
        return {
            semiMajorAxis: 0,
            eccentricity: 0,
            inclination: 0,
            raan: 0,
            argumentOfPeriapsis: 0,
            trueAnomaly: 0,
        };
    }
}