import { Container, Sprite, type Application } from 'pixi.js';
import type { CharState } from '../sim/actions.js';
import { STAGE_H, STAGE_W } from '../sim/constants.js';
import type { Player, World } from '../sim/world.js';
import type { CharTextures, GameTextures } from './assets.js';

// 캐릭터 sprite 사양: 256x256, 발 중앙 (128, 240).
// anchor = (128/256, 240/256) → sim의 (p.x, p.y)(발 끝)와 sprite 발 끝이 일치.
// 사양이 바뀌면 placeholder 생성 스크립트와 이 값을 같이 바꿔야 함.
const ANCHOR_X = 128 / 256;
const ANCHOR_Y = 240 / 256;
const CHAR_SPRITE_SCALE = 1.0;

// P1/P2 색 구분은 sprite tint로. sprite는 흑백 실루엣이라 tint가 그대로 액센트 색이 됨.
const TINT_P1 = 0xa8d8ff;        // 시원한 청색
const TINT_P2 = 0xffb87a;        // 따뜻한 주황
const TINT_WINDUP = 0xff6b3d;    // 주황빨강 — windup telegraph
const TINT_DODGE = 0x6dd9e3;     // 시안 — 회피 시각 신호 (i-frame 아님, 단순 시각 식별용)
const TINT_HIT_FLASH = 0xffffff; // 피격 흰 플래시

const PLAYER_TINTS: readonly number[] = [TINT_P1, TINT_P2];

function pickTexture(state: CharState, t: CharTextures) {
  switch (state.kind) {
    case 'idle': return t.idle;
    case 'windup': return t.windup;
    case 'active': return t.active;
    case 'recovery': return t.recovery;
    case 'dodge': return t.dodge;
  }
}

function lerpColor(from: number, to: number, t: number): number {
  const fr = (from >> 16) & 0xff, fg = (from >> 8) & 0xff, fb = from & 0xff;
  const tr = (to >> 16) & 0xff, tg = (to >> 8) & 0xff, tb = to & 0xff;
  const r = Math.round(fr + (tr - fr) * t);
  const g = Math.round(fg + (tg - fg) * t);
  const b = Math.round(fb + (tb - fb) * t);
  return (r << 16) | (g << 8) | b;
}

function tintFor(p: Player, base: number): number {
  if (p.hitFlashFrames > 0) return TINT_HIT_FLASH;
  if (p.state.kind === 'windup') {
    const t = p.state.frame / p.state.action.windupFrames;
    return lerpColor(base, TINT_WINDUP, 0.35 + 0.55 * t);
  }
  if (p.state.kind === 'dodge') return TINT_DODGE;
  return base;
}

interface PlayerView {
  sprite: Sprite;
}

interface AfterimageRec {
  sprite: Sprite;
  age: number;
  maxAge: number;
}

const AFTERIMAGE_MAX_AGE = 18;       // ~300ms 후 페이드 아웃
const AFTERIMAGE_START_ALPHA = 0.55;

// 시뮬레이션의 거울. World를 읽어 Pixi 씬을 갱신한다.
// 잔상/hit flash 같은 순수 시각 효과는 여기서만 처리 — sim에 누수되지 않게.
export class WorldView {
  readonly stage: Container;
  private readonly bgLayer: Container;
  private readonly afterimageLayer: Container;
  private readonly characterLayer: Container;

  private readonly playerViews = new Map<number, PlayerView>();
  private readonly afterimages: AfterimageRec[] = [];
  private lastSeenTick = -1;

  constructor(app: Application, private readonly tex: GameTextures) {
    this.stage = new Container();
    app.stage.addChild(this.stage);

    // z-order: bg < afterimage < character
    this.bgLayer = new Container();
    this.afterimageLayer = new Container();
    this.characterLayer = new Container();
    this.stage.addChild(this.bgLayer, this.afterimageLayer, this.characterLayer);

    const bg = new Sprite(tex.bg);
    bg.width = STAGE_W;
    bg.height = STAGE_H;
    this.bgLayer.addChild(bg);
  }

  sync(world: World, _alpha: number): void {
    // Tick 경계에서만 잔상 기록/노화. rAF는 가변이므로 한 tick에 한 번.
    if (world.tick !== this.lastSeenTick) {
      this.lastSeenTick = world.tick;
      this.advanceAfterimages(world);
    }

    for (const p of world.players) {
      let pv = this.playerViews.get(p.id);
      if (!pv) {
        const sprite = new Sprite(this.tex.samurai.idle);
        sprite.anchor.set(ANCHOR_X, ANCHOR_Y);
        sprite.scale.set(CHAR_SPRITE_SCALE);
        this.characterLayer.addChild(sprite);
        pv = { sprite };
        this.playerViews.set(p.id, pv);
      }
      pv.sprite.texture = pickTexture(p.state, this.tex.samurai);
      pv.sprite.position.set(p.x, p.y);
      // facing 미러: anchor 기준으로 좌우 반전. Sprite는 음수 scale 지원.
      pv.sprite.scale.x = CHAR_SPRITE_SCALE * p.facing;
      pv.sprite.scale.y = CHAR_SPRITE_SCALE;
      const base = PLAYER_TINTS[p.id] ?? 0xffffff;
      pv.sprite.tint = tintFor(p, base);
    }
  }

  private advanceAfterimages(world: World): void {
    // active(공격) 또는 dodge(회피) 동안 매 tick 잔상 1장 기록.
    for (const p of world.players) {
      if (p.state.kind !== 'active' && p.state.kind !== 'dodge') continue;
      const texture = pickTexture(p.state, this.tex.samurai);
      const s = new Sprite(texture);
      s.anchor.set(ANCHOR_X, ANCHOR_Y);
      s.scale.set(CHAR_SPRITE_SCALE);
      s.scale.x = CHAR_SPRITE_SCALE * p.facing;
      s.position.set(p.x, p.y);
      s.tint = p.state.kind === 'dodge' ? TINT_DODGE : (PLAYER_TINTS[p.id] ?? 0xffffff);
      s.alpha = AFTERIMAGE_START_ALPHA;
      this.afterimageLayer.addChild(s);
      this.afterimages.push({ sprite: s, age: 0, maxAge: AFTERIMAGE_MAX_AGE });
    }

    // 노화 + 알파 페이드 + 만료 destroy
    for (let i = this.afterimages.length - 1; i >= 0; i--) {
      const a = this.afterimages[i]!;
      a.age++;
      const t = a.age / a.maxAge;
      a.sprite.alpha = AFTERIMAGE_START_ALPHA * (1 - t);
      if (a.age >= a.maxAge) {
        a.sprite.destroy();
        this.afterimages.splice(i, 1);
      }
    }
  }
}
