import { Scene } from '../visualization/scene';
import { OrbitView } from '../visualization/orbit-view';

export class Renderer {
    private canvas: HTMLCanvasElement;
    private context: CanvasRenderingContext2D;
    private scene: Scene;
    private orbitView: OrbitView;

    constructor(canvasId: string) {
        this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
        this.context = this.canvas.getContext('2d')!;
        this.scene = new Scene();
        this.orbitView = new OrbitView(this, this.scene);
    }

    public initialize(): void {
        this.setupCanvas();
        this.render();
    }

    private setupCanvas(): void {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    private render(): void {
        this.clearCanvas();
    }

    private clearCanvas(): void {
        this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
}