import { Adapter } from './adapter';
import { VisualizationOptions, SpacecraftData } from './types';

export class SwiftBoostOps {
    private adapter: Adapter;

    constructor(options: VisualizationOptions) {
        this.adapter = new Adapter(options);
    }

    public visualizeSpacecraft(data: SpacecraftData): void {
        this.adapter.updateSpacecraftData(data);
    }
}

export { Adapter, VisualizationOptions, SpacecraftData };