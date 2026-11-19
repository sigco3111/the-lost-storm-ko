import { Group } from 'three';

export class RestingGroup extends Group {
  private atRest: boolean = false;

  get resting(): boolean {
    return this.atRest;
  }

  rest(): void {
    this.atRest = true;
  }

  wake(): void {
    if (!this.atRest) return;
    this.atRest = false;
    this.updateMatrixWorld(true);
  }

  override updateMatrixWorld(force?: boolean): void {
    if (this.atRest && !this.visible) return;
    super.updateMatrixWorld(force);
  }
}
