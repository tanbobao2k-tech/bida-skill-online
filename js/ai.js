// AI Opponent for Solo Practice / Offline Play

class PoolAI {
  computeShot(physics, rules) {
    const cue = physics.getCueBall();
    if (!cue || cue.pocketed) return null;

    // Determine valid target balls
    let targets = [];
    if (rules.mode === '9ball') {
      const lowest = rules.getLowestBallId(physics);
      const b = physics.balls.find((x) => x.id === lowest);
      if (b) targets = [b];
    } else if (rules.mode === '8ball') {
      const group = rules.groups[2];
      if (!group || rules.tableOpen) {
        targets = physics.balls.filter((b) => !b.pocketed && b.id > 0 && b.id !== 8);
      } else if (!rules.hasRemainingGroup(physics, group)) {
        targets = physics.balls.filter((b) => b.id === 8 && !b.pocketed);
      } else {
        targets = physics.balls.filter(
          (b) => !b.pocketed && b.id > 0 && b.id !== 8 && rules.getGroupOf(b.id) === group
        );
      }
    }

    if (targets.length === 0) {
      targets = physics.balls.filter((b) => !b.pocketed && b.id > 0);
    }

    // Break shot
    if (rules.isBreakShot) {
      return {
        angle: (Math.random() - 0.5) * 0.06,
        power: 0.92,
        spinX: 0,
        spinY: 0.2,
      };
    }

    let bestShot = null;
    let bestScore = -Infinity;

    for (const target of targets) {
      for (const pocket of POCKETS) {
        const toPocketX = pocket.x - target.x;
        const toPocketY = pocket.y - target.y;
        const distToPocket = Math.hypot(toPocketX, toPocketY);
        if (distToPocket === 0) continue;

        // Ghost ball position behind target
        const nx = toPocketX / distToPocket;
        const ny = toPocketY / distToPocket;
        const ghostX = target.x - nx * (BALL_R * 2);
        const ghostY = target.y - ny * (BALL_R * 2);

        const toGhostX = ghostX - cue.x;
        const toGhostY = ghostY - cue.y;
        const distToGhost = Math.hypot(toGhostX, toGhostY);
        if (distToGhost === 0) continue;

        const shotNx = toGhostX / distToGhost;
        const shotNy = toGhostY / distToGhost;

        // Cut angle dot product (1 = straight shot, 0 = 90 deg impossible)
        const dot = shotNx * nx + shotNy * ny;
        if (dot < 0.25) continue;

        // Check if path is blocked by another ball
        if (this.isPathBlocked(physics, cue, target, ghostX, ghostY)) continue;

        const score = dot * 100 - distToPocket * 0.08 - distToGhost * 0.05;
        if (score > bestScore) {
          bestScore = score;
          const baseAngle = Math.atan2(toGhostY, toGhostX);
          // Add slight human-like imperfection (~1.5 degrees)
          const jitter = (Math.random() - 0.5) * 0.032;
          const power = Math.min(0.85, Math.max(0.28, (distToGhost + distToPocket) / 1100));
          bestShot = {
            angle: baseAngle + jitter,
            power,
            spinX: 0,
            spinY: 0,
          };
        }
      }
    }

    // Fallback: hit closest valid target
    if (!bestShot && targets.length > 0) {
      const t = targets[0];
      bestShot = {
        angle: Math.atan2(t.y - cue.y, t.x - cue.x) + (Math.random() - 0.5) * 0.04,
        power: 0.45,
        spinX: 0,
        spinY: 0,
      };
    }

    return bestShot;
  }

  isPathBlocked(physics, cue, target, gx, gy) {
    for (const b of physics.balls) {
      if (b.pocketed || b.id === cue.id || b.id === target.id) continue;
      if (this.pointToSegmentDist(b.x, b.y, cue.x, cue.y, gx, gy) < BALL_R * 1.95) {
        return true;
      }
    }
    return false;
  }

  pointToSegmentDist(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(px - x1, py - y1);
    let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  }
}
