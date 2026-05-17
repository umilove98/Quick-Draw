import type { World } from '../sim/world.js';
import type { KeyboardState } from './keyboard.js';
import type { MouseState } from './mouse.js';
import { emptySnapshot, type InputSnapshot } from './types.js';

// 입력의 출처 추상화. 로컬 P1/P2, AI, 미래의 RemoteSource 모두 동일 인터페이스.
export interface InputSource {
  sample(tick: number, world: World): InputSnapshot;
}

export interface KeyMap {
  left: string;
  right: string;
  up: string;       // 사선 dash 방향용 (점프와 별개)
  down: string;
  jump: string;
  attack: string;   // 키보드 폴백
  dodge: string;
}

// 마우스 버튼 매핑 (PointerEvent.button: 0=LMB, 1=MMB, 2=RMB)
export interface MouseMap {
  attack: number;
  dodge: number;
}

export const DEFAULT_MOUSE_MAP: MouseMap = { attack: 0, dodge: 2 };

export const DEFAULT_P1_KEYS: KeyMap = {
  left: 'ArrowLeft',
  right: 'ArrowRight',
  up: 'ArrowUp',
  down: 'ArrowDown',
  jump: 'Space',
  attack: 'KeyZ',
  dodge: 'KeyX',
};

// 디버깅 보조용 (핫시트 인간 vs 인간은 타깃 아님 — memory: project_target_modes)
// P1과 안 겹치게 WASD + Q/E + ShiftLeft.
export const DEFAULT_P2_KEYS: KeyMap = {
  left: 'KeyA',
  right: 'KeyD',
  up: 'KeyW',
  down: 'KeyS',
  jump: 'ShiftLeft',
  attack: 'KeyQ',
  dodge: 'KeyE',
};

export class LocalSource implements InputSource {
  constructor(
    private readonly kb: KeyboardState,
    private readonly keys: KeyMap,
    private readonly mouse?: MouseState,
    private readonly mouseMap: MouseMap = DEFAULT_MOUSE_MAP,
  ) {}

  sample(tick: number, _world: World): InputSnapshot {
    const left = this.kb.isHeld(this.keys.left);
    const right = this.kb.isHeld(this.keys.right);
    const up = this.kb.isHeld(this.keys.up);
    const down = this.kb.isHeld(this.keys.down);
    const dirX: -1 | 0 | 1 = left === right ? 0 : (left ? -1 : 1);
    const dirY: -1 | 0 | 1 = up === down ? 0 : (up ? -1 : 1);

    const snap = emptySnapshot(tick);
    snap.dirX = dirX;
    snap.dirY = dirY;
    snap.jump = this.kb.isHeld(this.keys.jump);
    snap.jumpPressed = this.kb.isPressed(this.keys.jump);

    // attack/dodge는 키보드 OR 마우스
    const mouseAttackHeld = this.mouse?.isDown(this.mouseMap.attack) ?? false;
    const mouseAttackPressed = this.mouse?.isPressed(this.mouseMap.attack) ?? false;
    const mouseDodgeHeld = this.mouse?.isDown(this.mouseMap.dodge) ?? false;
    const mouseDodgePressed = this.mouse?.isPressed(this.mouseMap.dodge) ?? false;

    snap.attack = this.kb.isHeld(this.keys.attack) || mouseAttackHeld;
    snap.attackPressed = this.kb.isPressed(this.keys.attack) || mouseAttackPressed;
    snap.dodge = this.kb.isHeld(this.keys.dodge) || mouseDodgeHeld;
    snap.dodgePressed = this.kb.isPressed(this.keys.dodge) || mouseDodgePressed;

    if (this.mouse) {
      snap.aimX = this.mouse.x;
      snap.aimY = this.mouse.y;
    }
    return snap;
  }
}
