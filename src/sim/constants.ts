export const TICK_HZ = 60;
export const DT_MS = 1000 / TICK_HZ;

export const STAGE_W = 1024;
export const STAGE_H = 576;
export const GROUND_Y = 480;

export const GRAVITY = 1800;        // px / s^2 (상승 시)
export const FALL_GRAVITY_MULT = 1.7; // 낙하 시 중력 배수 (격투/플랫포머에선 비대칭이 게임 필을 살림)
export const MOVE_SPEED = 360;      // px / s
export const JUMP_VEL = -720;       // px / s (negative = up)

export const CHAR_W = 48;
export const CHAR_H = 96;

// 시각/피드백
export const HIT_FLASH_FRAMES = 12; // 피격 시 흰 플래시 지속 (~200ms)

// 라운드/매치
export const WIN_TARGET = 2;             // 3전 2선승
export const ROUND_END_HOLD_TICKS = 90;  // 라운드 종료 후 다음 라운드까지 hold (~1.5s)

// 쿨다운 (액션 발동 시점 기준)
export const ATTACK_COOLDOWN_TICKS = 120;  // 2초 — 신중한 발도술
export const DODGE_COOLDOWN_TICKS = 60;    // 1초
