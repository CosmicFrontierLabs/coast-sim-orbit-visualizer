export class Scene {
    private objects: any[] = [];

    public addObject(object: any): void {
        this.objects.push(object);
    }

    public removeObject(object: any): void {
        this.objects = this.objects.filter(obj => obj !== object);
    }

    public getObjects(): any[] {
        return this.objects;
    }

    public updateScene(): void {}
}