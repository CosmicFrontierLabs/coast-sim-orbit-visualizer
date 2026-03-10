import { VisualizationOptions, SpacecraftData } from './types';

export class Adapter {
    private swiftBoostOps: any;

    constructor(swiftBoostOps: any) {
        this.swiftBoostOps = swiftBoostOps;
    }

    public initializeVisualization(options: VisualizationOptions): void {
        this.swiftBoostOps.initialize(options);
    }

    public updateSpacecraftData(data: SpacecraftData): void {
        this.swiftBoostOps.updateData(data);
    }

    public renderOrbit(): void {
        this.swiftBoostOps.renderOrbit();
    }
}