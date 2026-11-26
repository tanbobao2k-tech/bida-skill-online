// High-precision sub-stepped 2D Billiards Physics Engine
// Table logical playing surface: 1000 x 500 (2:1 pro tournament ratio)

const TABLE_W = 1000;
const TABLE_H = 500;
const BALL_R = 14;
const POCKET_R_CORNER = 25;
const POCKET_R_SIDE = 22;

const POCKETS = [
  { x: 4, y: 4, r: POCKET_R_CORNER, type: 'corner' },
  { x: TABLE_W / 2, y: -5, r: POCKET_R_SIDE, type: 'side' },
  { x: TABLE_W - 4, y: 4, r: POCKET_R_CORNER, type: 'corner' },
  { x: 4, y: TABLE_H - 4, r: POCKET_R_CORNER, type: 'corner' },
  { x: TABLE_W / 2, y: TABLE_H + 5, r: POCKET_R_SIDE, type: 'side' },
  { x: TABLE_W - 4, y: TABLE_H - 4, r: POCKET_R_CORNER, type: 'corner' },
];

// Ball colors (standard tournament palette)
const BALL_COLORS = {
  0: '#f8fafc',  // Cue ball
  1: '#facc15',  // Yellow
  2: '#2563eb',  // Blue
  3: '#dc2626',  // Red
  4: '#7c3aed',  // Purple
  5: '#ea580c',  // Orange
  6: '#16a34a',  // Green
  7: '#991b1b',  // Maroon / Burgundy
  8: '#111827',  // Black 8-ball
  9: '#facc15',
  10: '#2563eb',
  11: '#dc2626',
  12: '#7c3aed',
  13: '#ea580c',
  14: '#16a34a',
  15: '#991b1b',
};

class PoolPhysics {
  constructor(callbacks = {}) {
    this.balls = [];
    this.callbacks = callbacks; // onBallHit, onRailHit, onPocket
    this.shotEvents = this.resetShotEvents();
    this.isMoving = false;
  }

  resetShotEvents() {
    this.shotEvents = {
      firstHit: null,
      railAfterContact: false,
      anyRailHit: false,
      pocketed: [],
    };
    return this.shotEvents;
  }

  createBall(id, x, y) {
    return {
      id,
      x,
      y,
      vx: 0,
      vy: 0,
      spinX: 0, // -1..1 side english
      spinY: 0, // -1..1 draw/follow
      spinActive: false,
      pocketed: false,
      color: BALL_COLORS[id] || '#ffffff',
      isStripe: id >= 9 && id <= 15,
      rollAngle: 0,
    };
  }

  getCueBall() {
    return this.balls.find((b) => b.id === 0);
  }

  strikeCueBall(angle, powerPct, spinX = 0, spinY = 0) {
    const cue = this.getCueBall();
    if (!cue || cue.pocketed) return;

    this.resetShotEvents();
    // Max speed ~ 24 px/frame (1440 px/s) for a full power break
    const minSpeed = 1.8;
    const maxSpeed = 24.5;
    const p = Math.max(0.02, Math.min(1, powerPct));
    // Non-linear power curve feels much better for soft touch vs hard break
    const speed = minSpeed + Math.pow(p, 1.35) * (maxSpeed - minSpeed);

    cue.vx = Math.cos(angle) * speed;
    cue.vy = Math.sin(angle) * speed;
    cue.spinX = spinX * p;
    cue.spinY = spinY * p;
    cue.spinActive = true;
    this.isMoving = true;
  }

  step() {
    const SUBSTEPS = 8;
    const dt = 1 / SUBSTEPS;
    let anyMoving = false;

    for (let s = 0; s < SUBSTEPS; s++) {
      // 1. Move & apply felt friction
      for (const b of this.balls) {
        if (b.pocketed) continue;

        // Subtle swerve from side english when cue ball has spin
        if (b.id === 0 && b.spinActive && Math.abs(b.spinX) > 0.05) {
          const spd = Math.hypot(b.vx, b.vy);
          if (spd > 0.5 && spd < 12) {
            const nx = -b.vy / spd;
            const ny = b.vx / spd;
            b.vx += nx * b.spinX * 0.012 * dt;
            b.vy += ny * b.spinX * 0.012 * dt;
          }
        }

        b.x += b.vx * dt;
        b.y += b.vy * dt;

        const speed = Math.hypot(b.vx, b.vy);
        if (speed > 0.0001) {
          b.rollAngle += speed * dt * 0.08;
          // Natural tournament felt speed, clean stop below 0.12 so balls don't crawl forever
          const friction = speed > 1.8 ? 0.991 : 0.976;
          const factor = Math.pow(friction, dt);
          b.vx *= factor;
          b.vy *= factor;

          if (Math.hypot(b.vx, b.vy) < 0.12) {
            b.vx = 0;
            b.vy = 0;
            b.spinX = 0;
            b.spinY = 0;
            b.spinActive = false;
          } else {
            anyMoving = true;
          }
        }
      }

      // 2. Check pocket captures BEFORE rail bounce so pocketed balls drop cleanly
      for (const b of this.balls) {
        if (b.pocketed) continue;
        let captured = false;
        for (const p of POCKETS) {
          const dist = Math.hypot(b.x - p.x, b.y - p.y);
          if (dist < p.r) {
            b.pocketed = true;
            b.vx = 0;
            b.vy = 0;
            b.spinActive = false;
            this.shotEvents.pocketed.push(b.id);
            if (this.callbacks.onPocket) this.callbacks.onPocket(b, p);
            captured = true;
            break;
          }
        }
        if (captured) continue;

        // Safety net: if a fast ball slipped past the rail at a pocket mouth, snap-capture to nearest pocket
        if (b.x < -4 || b.x > TABLE_W + 4 || b.y < -4 || b.y > TABLE_H + 4) {
          let nearest = null;
          let minD = Infinity;
          for (const p of POCKETS) {
            const d = Math.hypot(b.x - p.x, b.y - p.y);
            if (d < minD) {
              minD = d;
              nearest = p;
            }
          }
          if (nearest && minD < 65) {
            b.pocketed = true;
            b.vx = 0;
            b.vy = 0;
            b.spinActive = false;
            this.shotEvents.pocketed.push(b.id);
            if (this.callbacks.onPocket) this.callbacks.onPocket(b, nearest);
          } else {
            b.x = Math.max(BALL_R, Math.min(TABLE_W - BALL_R, b.x));
            b.y = Math.max(BALL_R, Math.min(TABLE_H - BALL_R, b.y));
          }
        }
      }

      // 3. Cushion / Rail collisions (skip if near a pocket mouth)
      for (const b of this.balls) {
        if (b.pocketed) continue;
        this.handleRailCollision(b);
      }

      // 4. Ball-to-Ball elastic collisions
      const n = this.balls.length;
      for (let i = 0; i < n; i++) {
        const b1 = this.balls[i];
        if (b1.pocketed) continue;
        for (let j = i + 1; j < n; j++) {
          const b2 = this.balls[j];
          if (b2.pocketed) continue;
          this.handleBallCollision(b1, b2);
        }
      }
    }

    this.isMoving = anyMoving;
    return anyMoving;
  }

  isNearPocketMouth(x, y) {
    // Allow balls to enter pocket mouths without bouncing off the cushion
    if (x < 34 && (y < 34 || y > TABLE_H - 34)) return true;
    if (x > TABLE_W - 34 && (y < 34 || y > TABLE_H - 34)) return true;
    if (Math.abs(x - TABLE_W / 2) < 24 && (y < 22 || y > TABLE_H - 22)) return true;
    return false;
  }

  handleRailCollision(b) {
    if (this.isNearPocketMouth(b.x, b.y)) return;

    const restitution = 0.82;
    let hitRail = false;
    let impactSpeed = 0;

    if (b.x - BALL_R < 0) {
      b.x = BALL_R;
      impactSpeed = Math.abs(b.vx);
      b.vx = Math.abs(b.vx) * restitution;
      // English affects vertical rebound
      if (b.id === 0 && b.spinActive) {
        b.vy += b.spinX * impactSpeed * 0.18;
        b.spinX *= 0.4;
      }
      hitRail = true;
    } else if (b.x + BALL_R > TABLE_W) {
      b.x = TABLE_W - BALL_R;
      impactSpeed = Math.abs(b.vx);
      b.vx = -Math.abs(b.vx) * restitution;
      if (b.id === 0 && b.spinActive) {
        b.vy -= b.spinX * impactSpeed * 0.18;
        b.spinX *= 0.4;
      }
      hitRail = true;
    }

    if (b.y - BALL_R < 0) {
      b.y = BALL_R;
      impactSpeed = Math.abs(b.vy);
      b.vy = Math.abs(b.vy) * restitution;
      if (b.id === 0 && b.spinActive) {
        b.vx -= b.spinX * impactSpeed * 0.18;
        b.spinX *= 0.4;
      }
      hitRail = true;
    } else if (b.y + BALL_R > TABLE_H) {
      b.y = TABLE_H - BALL_R;
      impactSpeed = Math.abs(b.vy);
      b.vy = -Math.abs(b.vy) * restitution;
      if (b.id === 0 && b.spinActive) {
        b.vx += b.spinX * impactSpeed * 0.18;
        b.spinX *= 0.4;
      }
      hitRail = true;
    }

    if (hitRail) {
      this.shotEvents.anyRailHit = true;
      if (this.shotEvents.firstHit !== null) {
        this.shotEvents.railAfterContact = true;
      }
      if (this.callbacks.onRailHit && impactSpeed > 0.3) {
        this.callbacks.onRailHit(impactSpeed);
      }
    }
  }

  handleBallCollision(b1, b2) {
    const dx = b2.x - b1.x;
    const dy = b2.y - b1.y;
    const dist = Math.hypot(dx, dy);
    const minDist = BALL_R * 2;

    if (dist >= minDist || dist === 0) return;

    // Track first hit by cue ball
    if (this.shotEvents.firstHit === null) {
      if (b1.id === 0) this.shotEvents.firstHit = b2.id;
      else if (b2.id === 0) this.shotEvents.firstHit = b1.id;
    }

    // Separate overlapping balls
    const overlap = (minDist - dist) / 2;
    const nx = dx / dist;
    const ny = dy / dist;
    b1.x -= nx * overlap;
    b1.y -= ny * overlap;
    b2.x += nx * overlap;
    b2.y += ny * overlap;

    // Relative velocity along normal
    const dvx = b1.vx - b2.vx;
    const dvy = b1.vy - b2.vy;
    const velAlongNormal = dvx * nx + dvy * ny;

    if (velAlongNormal <= 0) return;

    const restitution = 0.94;
    const impulse = ((1 + restitution) * velAlongNormal) / 2;

    b1.vx -= impulse * nx;
    b1.vy -= impulse * ny;
    b2.vx += impulse * nx;
    b2.vy += impulse * ny;

    // Follow / Draw spin transfer on cue ball's first impact
    const cue = b1.id === 0 ? b1 : b2.id === 0 ? b2 : null;
    if (cue && cue.spinActive && Math.abs(cue.spinY) > 0.05) {
      const hitDirX = cue === b1 ? nx : -nx;
      const hitDirY = cue === b1 ? ny : -ny;
      const spinForce = cue.spinY * velAlongNormal * 0.42;
      cue.vx += hitDirX * spinForce;
      cue.vy += hitDirY * spinForce;
      cue.spinY *= 0.2; // Consume most of the follow/draw on first hit
    }

    if (this.callbacks.onBallHit && velAlongNormal > 0.25) {
      this.callbacks.onBallHit(velAlongNormal);
    }
  }

  // Export/Import compact state for network sync
  exportState() {
    return this.balls.map((b) => ({
      id: b.id,
      x: Math.round(b.x * 100) / 100,
      y: Math.round(b.y * 100) / 100,
      pocketed: b.pocketed,
    }));
  }

  importState(snapshot) {
    for (const s of snapshot) {
      const b = this.balls.find((ball) => ball.id === s.id);
      if (b) {
        b.x = s.x;
        b.y = s.y;
        b.vx = 0;
        b.vy = 0;
        b.pocketed = s.pocketed;
      }
    }
    this.isMoving = false;
  }
}
