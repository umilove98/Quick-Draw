// PointerEvent 기반 마우스 상태. KeyboardState와 같은 패턴 — held + edge.
// LMB=0, MMB=1, RMB=2 (PointerEvent.button 표준)

export class MouseState {
  private held = new Set<number>();
  private heldPrev = new Set<number>();
  private _x = 0;
  private _y = 0;
  private target: HTMLElement | null = null;

  attach(target: HTMLElement): void {
    this.target = target;
    target.addEventListener('pointerdown', this.onDown);
    target.addEventListener('pointerup', this.onUp);
    target.addEventListener('pointermove', this.onMove);
    target.addEventListener('pointerleave', this.onLeave);
    window.addEventListener('blur', this.clear);
  }

  detach(): void {
    if (!this.target) return;
    this.target.removeEventListener('pointerdown', this.onDown);
    this.target.removeEventListener('pointerup', this.onUp);
    this.target.removeEventListener('pointermove', this.onMove);
    this.target.removeEventListener('pointerleave', this.onLeave);
    window.removeEventListener('blur', this.clear);
    this.target = null;
  }

  isDown(button: number): boolean {
    return this.held.has(button);
  }

  isPressed(button: number): boolean {
    return this.held.has(button) && !this.heldPrev.has(button);
  }

  get x(): number { return this._x; }
  get y(): number { return this._y; }

  commitTick(): void {
    this.heldPrev = new Set(this.held);
  }

  private onDown = (e: PointerEvent): void => {
    this.held.add(e.button);
    this.updatePos(e);
    e.preventDefault();
  };

  private onUp = (e: PointerEvent): void => {
    this.held.delete(e.button);
    this.updatePos(e);
  };

  private onMove = (e: PointerEvent): void => {
    this.updatePos(e);
  };

  private onLeave = (): void => {
    // pointer가 캔버스 밖으로 나가면 held는 유지(드래그 중일 수 있음)하되,
    // 화면 밖에서 mouseup이 발생하면 우리 onUp이 못 듣는 케이스가 있음.
    // 일단 단순화 — clear 안 함. 문제 생기면 보강.
  };

  private clear = (): void => {
    this.held.clear();
  };

  private updatePos(e: PointerEvent): void {
    if (!this.target) return;
    const rect = this.target.getBoundingClientRect();
    // canvas의 CSS 크기와 stage logical 크기가 다를 수 있음 — 단순히 client-relative.
    this._x = e.clientX - rect.left;
    this._y = e.clientY - rect.top;
  }
}
