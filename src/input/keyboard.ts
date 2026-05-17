// 브라우저 KeyboardEvent를 읽어 "현재 눌려있는 키" Set을 유지한다.
// repeat 무시, focus 잃을 때 클리어, layout-independent를 위해 event.code 사용.
//
// sample()은 tick마다 호출되어 직전 tick 대비 새로 눌린 키(pressed edge)를 계산한다.

export class KeyboardState {
  private held = new Set<string>();
  private heldPrev = new Set<string>();

  attach(): void {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.clear);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  detach(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.clear);
    document.removeEventListener('visibilitychange', this.onVisibility);
  }

  isHeld(code: string): boolean {
    return this.held.has(code);
  }

  // 이번 tick에 새로 눌렸는가? (직전 tick 시점 대비)
  isPressed(code: string): boolean {
    return this.held.has(code) && !this.heldPrev.has(code);
  }

  // tick이 끝날 때 호출. heldPrev <- held 스냅샷.
  commitTick(): void {
    this.heldPrev = new Set(this.held);
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.repeat) return; // OS 자동반복 무시
    this.held.add(e.code);
    // 게임 내에서 쓰는 키는 기본 동작 차단 (스크롤 등)
    if (BLOCKED_DEFAULTS.has(e.code)) e.preventDefault();
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.held.delete(e.code);
  };

  private clear = (): void => {
    this.held.clear();
  };

  private onVisibility = (): void => {
    if (document.hidden) this.clear();
  };
}

const BLOCKED_DEFAULTS = new Set([
  'Space',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
]);
