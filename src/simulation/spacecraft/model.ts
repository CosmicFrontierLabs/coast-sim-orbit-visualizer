export class SpacecraftModel {
    mass: number;
    dimensions: { length: number; width: number; height: number };
    properties: { [key: string]: any };

    constructor(mass: number, dimensions: { length: number; width: number; height: number }, properties: { [key: string]: any } = {}) {
        this.mass = mass;
        this.dimensions = dimensions;
        this.properties = properties;
    }

    getMass(): number {
        return this.mass;
    }

    getDimensions(): { length: number; width: number; height: number } {
        return this.dimensions;
    }

    getProperty(key: string): any {
        return this.properties[key];
    }

    setProperty(key: string, value: any): void {
        this.properties[key] = value;
    }
}