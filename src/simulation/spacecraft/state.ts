export class SpacecraftState {
    position: { x: number; y: number; z: number };
    velocity: { vx: number; vy: number; vz: number };
    orientation: { roll: number; pitch: number; yaw: number };

    constructor(position: { x: number; y: number; z: number }, velocity: { vx: number; vy: number; vz: number }, orientation: { roll: number; pitch: number; yaw: number }) {
        this.position = position;
        this.velocity = velocity;
        this.orientation = orientation;
    }

    updateState(newPosition: { x: number; y: number; z: number }, newVelocity: { vx: number; vy: number; vz: number }, newOrientation: { roll: number; pitch: number; yaw: number }) {
        this.position = newPosition;
        this.velocity = newVelocity;
        this.orientation = newOrientation;
    }
}