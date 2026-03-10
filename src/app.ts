import { Renderer } from './visualization/renderer';
import { Scene } from './visualization/scene';
import { OrbitView } from './visualization/orbit-view';

class App {
    private renderer!: Renderer;
    private scene!: Scene;
    private orbitView!: OrbitView;

    constructor() {
        this.initialize();
    }

    private initialize(): void {
        this.renderer = new Renderer('orbit-canvas');
        this.scene = new Scene();
        this.orbitView = new OrbitView(this.renderer, this.scene);

        this.setupScene();
        this.startRendering();
    }

    private setupScene(): void {
        this.scene.addObject(this.orbitView);
    }

    private startRendering(): void {
        this.renderer.initialize();
    }
}

const app = new App();