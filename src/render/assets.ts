import { Assets, type Texture } from 'pixi.js';

// 에셋 매니페스트 — 모든 텍스처를 한 곳에서 선언.
// 게임 시작 전에 한 번에 로드해서 sync(world) 안에서 await 없이 즉시 swap 가능하게.
//
// 사용자가 PNG를 같은 경로에 덮어쓰면 자동 반영 (Vite dev는 reload).
// placeholder 사양: 캐릭터 256x256 (앵커 발 중앙 = 128,240), 배경 1024x576.

export interface CharTextures {
  idle: Texture;
  windup: Texture;
  active: Texture;
  recovery: Texture;
  dodge: Texture;
}

export interface GameTextures {
  bg: Texture;
  samurai: CharTextures;
}

const MANIFEST = {
  bgStage01: '/assets/bg/stage01.png',
  samuraiIdle: '/assets/char/samurai/idle.png',
  samuraiWindup: '/assets/char/samurai/windup.png',
  samuraiActive: '/assets/char/samurai/active.png',
  samuraiRecovery: '/assets/char/samurai/recovery.png',
  samuraiDodge: '/assets/char/samurai/dodge.png',
} as const;

export async function loadAssets(): Promise<GameTextures> {
  // Assets.load는 url 배열 받아 병렬 로드
  const urls = Object.values(MANIFEST);
  const loaded = await Assets.load<Texture>(urls);

  // url → Texture 매핑 추출 (Assets.load는 url-keyed record 반환)
  const tex = (url: string): Texture => {
    const t = loaded[url];
    if (!t) throw new Error(`asset not loaded: ${url}`);
    return t;
  };

  return {
    bg: tex(MANIFEST.bgStage01),
    samurai: {
      idle: tex(MANIFEST.samuraiIdle),
      windup: tex(MANIFEST.samuraiWindup),
      active: tex(MANIFEST.samuraiActive),
      recovery: tex(MANIFEST.samuraiRecovery),
      dodge: tex(MANIFEST.samuraiDodge),
    },
  };
}
