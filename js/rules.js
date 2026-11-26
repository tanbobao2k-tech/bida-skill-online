// Pool Game Rules Engine: 8-Ball, 9-Ball, and Free Practice

class PoolRules {
  constructor(mode = '8ball') {
    this.mode = mode; // '8ball' | '9ball' | 'practice'
    this.reset();
  }

  reset() {
    this.turn = 1; // 1 or 2
    this.isBreakShot = true;
    this.ballInHand = true; // Allow placing cue ball behind head string on break
    this.groups = { 1: null, 2: null }; // 'solid' | 'stripe' for 8ball
    this.pocketedBy = { 1: [], 2: [] };
    this.winner = null;
    this.winReason = '';
    this.tableOpen = true;
  }

  setupRack(physics) {
    physics.balls = [];
    // Cue ball at head spot (left quarter)
    physics.balls.push(physics.createBall(0, TABLE_W * 0.25, TABLE_H / 2));

    const footX = TABLE_W * 0.74;
    const footY = TABLE_H / 2;
    const gap = BALL_R * 2 + 0.6;
    const rowDx = gap * Math.cos(Math.PI / 6);

    if (this.mode === '8ball' || this.mode === 'practice') {
      // Standard 8-ball triangle: 8 in center (row 3, col 1), 1 solid & 1 stripe in back corners
      const solids = [1, 2, 3, 4, 5, 6, 7];
      const stripes = [9, 10, 11, 12, 13, 14, 15];
      // Shuffle except 8
      const shuffle = (arr) => arr.sort(() => Math.random() - 0.5);
      shuffle(solids);
      shuffle(stripes);

      const cornerA = solids.pop();
      const cornerB = stripes.pop();
      const pool = shuffle([...solids, ...stripes]);

      let idx = 0;
      for (let row = 0; row < 5; row++) {
        for (let col = 0; col <= row; col++) {
          const x = footX + row * rowDx;
          const y = footY + (col - row / 2) * gap;
          let id;
          if (row === 2 && col === 1) {
            id = 8;
          } else if (row === 4 && col === 0) {
            id = cornerA;
          } else if (row === 4 && col === 4) {
            id = cornerB;
          } else {
            id = pool[idx++];
          }
          physics.balls.push(physics.createBall(id, x, y));
        }
      }
    } else if (this.mode === '9ball') {
      // Diamond rack: 1 at apex, 9 in center, 2..8 around
      const others = [2, 3, 4, 5, 6, 7, 8].sort(() => Math.random() - 0.5);
      const positions = [
        [0, 0, 1],
        [1, -0.5, others[0]],
        [1, 0.5, others[1]],
        [2, -1, others[2]],
        [2, 0, 9],
        [2, 1, others[3]],
        [3, -0.5, others[4]],
        [3, 0.5, others[5]],
        [4, 0, others[6]],
      ];
      for (const [r, c, id] of positions) {
        const x = footX + r * rowDx;
        const y = footY + c * gap;
        physics.balls.push(physics.createBall(id, x, y));
      }
    }
  }

  getLowestBallId(physics) {
    const alive = physics.balls.filter((b) => b.id > 0 && !b.pocketed);
    if (alive.length === 0) return null;
    return Math.min(...alive.map((b) => b.id));
  }

  getGroupOf(id) {
    if (id >= 1 && id <= 7) return 'solid';
    if (id >= 9 && id <= 15) return 'stripe';
    return 'eight';
  }

  hasRemainingGroup(physics, group) {
    return physics.balls.some(
      (b) => !b.pocketed && b.id > 0 && b.id !== 8 && this.getGroupOf(b.id) === group
    );
  }

  // Evaluate shot result after all balls stop moving
  evaluateShot(physics, events) {
    const cue = physics.getCueBall();
    const scratched = events.pocketed.includes(0);
    const objectPocketed = events.pocketed.filter((id) => id !== 0);
    const otherPlayer = this.turn === 1 ? 2 : 1;

    if (this.mode === 'practice') {
      if (scratched) {
        cue.pocketed = false;
        cue.x = TABLE_W * 0.25;
        cue.y = TABLE_H / 2;
        return { message: 'Bi cái rơi lỗ — Đã đặt lại vị trí', foul: true };
      }
      if (objectPocketed.length > 0) {
        this.pocketedBy[1].push(...objectPocketed);
        return { message: `Vào lỗ bi ${objectPocketed.join(', ')}!`, foul: false };
      }
      return { message: 'Lượt tiếp theo', foul: false };
    }

    if (this.mode === '8ball') {
      return this.evaluate8Ball(physics, events, scratched, objectPocketed, otherPlayer);
    }

    if (this.mode === '9ball') {
      return this.evaluate9Ball(physics, events, scratched, objectPocketed, otherPlayer);
    }
  }

  evaluate8Ball(physics, events, scratched, objectPocketed, otherPlayer) {
    const currentGroup = this.groups[this.turn];
    const eightPocketed = objectPocketed.includes(8);
    // Player must have cleared ALL of their own balls BEFORE this shot to shoot the 8-ball
    const hadClearedOwnBeforeShot =
      !this.tableOpen &&
      currentGroup &&
      !this.hasRemainingGroup(physics, currentGroup) &&
      !objectPocketed.some((id) => this.getGroupOf(id) === currentGroup);

    // 1. Check 8-ball pocketed
    if (eightPocketed) {
      if (this.isBreakShot) {
        // Re-spot 8-ball on break instead of instant win
        const b8 = physics.balls.find((b) => b.id === 8);
        if (b8) {
          b8.pocketed = false;
          b8.x = TABLE_W * 0.74;
          b8.y = TABLE_H / 2;
        }
        if (scratched) {
          const cue = physics.getCueBall();
          cue.pocketed = false;
          cue.x = TABLE_W * 0.25;
          cue.y = TABLE_H / 2;
          this.isBreakShot = false;
          this.turn = otherPlayer;
          this.ballInHand = true;
          return { message: 'Phá bi rơi bi cái & bi 8 — Đặt lại bi 8, đối thủ đặt bi!', foul: true };
        }
        this.isBreakShot = false;
        return { message: 'Bi số 8 vào lỗ khi phá bi — Đã đặt lại bi 8 lên bàn!', foul: false };
      }

      if (!scratched && hadClearedOwnBeforeShot && events.firstHit === 8) {
        this.winner = this.turn;
        this.winReason = `Người chơi ${this.turn} đã ăn hết bi của mình và chốt bi số 8 hợp lệ!`;
      } else {
        this.winner = otherPlayer;
        if (scratched) {
          this.winReason = 'Rơi bi cái khi đánh bi số 8 — Thua cuộc!';
        } else if (!hadClearedOwnBeforeShot) {
          this.winReason = 'Chưa ăn hết bi của mình mà đã đưa bi số 8 vào lỗ — Thua cuộc!';
        } else {
          this.winReason = 'Chạm bi khác trước khi đánh bi số 8 — Thua cuộc!';
        }
      }
      return { message: this.winReason, gameOver: true };
    }

    // 2. Check instant-loss for hitting 8-ball first before clearing own balls (after break)
    if (!this.isBreakShot && !hadClearedOwnBeforeShot && events.firstHit === 8) {
      this.winner = otherPlayer;
      this.winReason = 'Bắn chạm bi số 8 trước khi ăn hết bi của mình — Thua cuộc!';
      return { message: this.winReason, gameOver: true };
    }

    // 3. Check fouls
    let foulReason = null;
    if (scratched) {
      foulReason = 'Lỗi: Bi cái rơi lỗ!';
    } else if (events.firstHit === null) {
      foulReason = 'Lỗi: Không chạm bi nào!';
    } else if (!this.isBreakShot && !this.tableOpen && currentGroup) {
      const hitGroup = this.getGroupOf(events.firstHit);
      if (hadClearedOwnBeforeShot) {
        if (events.firstHit !== 8) foulReason = 'Lỗi: Đã hết bi, phải chạm bi số 8 trước!';
      } else if (hitGroup !== currentGroup) {
        foulReason = 'Lỗi: Chạm nhầm bi đối thủ trước!';
      }
    }

    if (!foulReason && !events.railAfterContact && objectPocketed.length === 0) {
      foulReason = 'Lỗi: Không có bi chạm băng sau va chạm!';
    }

    // Respawn cue ball if scratched
    if (scratched) {
      const cue = physics.getCueBall();
      cue.pocketed = false;
      cue.x = TABLE_W * 0.25;
      cue.y = TABLE_H / 2;
    }

    // Record pocketed balls for UI
    for (const id of objectPocketed) {
      const g = this.getGroupOf(id);
      if (this.groups[1] === g) this.pocketedBy[1].push(id);
      else if (this.groups[2] === g) this.pocketedBy[2].push(id);
      else this.pocketedBy[this.turn].push(id);
    }

    const wasBreak = this.isBreakShot;
    this.isBreakShot = false;

    if (foulReason) {
      this.turn = otherPlayer;
      this.ballInHand = true;
      return { message: `${foulReason} Đối thủ được đặt bi.`, foul: true };
    }

    // Assign groups if table is open (only after break)
    if (!wasBreak && this.tableOpen && objectPocketed.length > 0) {
      const firstG = this.getGroupOf(objectPocketed[0]);
      if (firstG === 'solid' || firstG === 'stripe') {
        this.groups[this.turn] = firstG;
        this.groups[otherPlayer] = firstG === 'solid' ? 'stripe' : 'solid';
        this.tableOpen = false;
        this.ballInHand = false;
        const label = firstG === 'solid' ? 'Bi Trơn (1-7)' : 'Bi Sọc (9-15)';
        return { message: `Chốt nhóm: ${label}! Tiếp tục lượt.`, foul: false };
      }
    }

    // Keep turn if pocketed own ball (or any ball on break/open table)
    const keepTurn =
      objectPocketed.length > 0 &&
      (wasBreak ||
        this.tableOpen ||
        objectPocketed.some((id) => this.getGroupOf(id) === this.groups[this.turn]));

    this.ballInHand = false;
    if (!keepTurn) {
      this.turn = otherPlayer;
      return { message: 'Đổi lượt', foul: false };
    }
    return { message: `Vào bi ${objectPocketed.join(', ')}! Đánh tiếp.`, foul: false };
  }

  evaluate9Ball(physics, events, scratched, objectPocketed, otherPlayer) {
    // Lowest ball BEFORE this shot = lowest among alive + pocketed this shot
    const aliveIds = physics.balls.filter((b) => b.id > 0 && !b.pocketed).map((b) => b.id);
    const allBefore = [...aliveIds, ...objectPocketed];
    const targetId = Math.min(...allBefore);

    let foulReason = null;
    if (scratched) {
      foulReason = 'Lỗi: Bi cái rơi lỗ!';
    } else if (events.firstHit === null) {
      foulReason = 'Lỗi: Không chạm bi nào!';
    } else if (events.firstHit !== targetId) {
      foulReason = `Lỗi: Phải chạm bi số ${targetId} trước!`;
    } else if (!events.railAfterContact && objectPocketed.length === 0) {
      foulReason = 'Lỗi: Không có bi chạm băng!';
    }

    if (scratched) {
      const cue = physics.getCueBall();
      cue.pocketed = false;
      cue.x = TABLE_W * 0.25;
      cue.y = TABLE_H / 2;
    }

    this.isBreakShot = false;

    const ninePocketed = objectPocketed.includes(9);
    if (ninePocketed) {
      if (!foulReason) {
        this.winner = this.turn;
        this.winReason = `Người chơi ${this.turn} đưa bi số 9 vào lỗ hợp lệ!`;
        return { message: this.winReason, gameOver: true };
      } else {
        // Re-spot 9-ball if pocketed on a foul
        const b9 = physics.balls.find((b) => b.id === 9);
        if (b9) {
          b9.pocketed = false;
          b9.x = TABLE_W * 0.74;
          b9.y = TABLE_H / 2;
        }
      }
    }

    for (const id of objectPocketed) {
      if (id !== 9) this.pocketedBy[this.turn].push(id);
    }

    if (foulReason) {
      this.turn = otherPlayer;
      this.ballInHand = true;
      return { message: `${foulReason} Đối thủ được đặt bi.`, foul: true };
    }

    this.ballInHand = false;
    if (objectPocketed.length > 0) {
      return { message: `Vào bi ${objectPocketed.join(', ')}! Đánh tiếp.`, foul: false };
    }

    this.turn = otherPlayer;
    return { message: 'Đổi lượt', foul: false };
  }
}
