// Main Game Controller: ties UI, Input, Physics, Rules, Renderer, Audio, Network, AI

(() => {
  const audio = new PoolAudio();
  const physics = new PoolPhysics({
    onBallHit: (spd) => audio.playBallHit(spd),
    onRailHit: (spd) => audio.playRailHit(spd),
    onPocket: () => audio.playPocket(),
  });
  const canvas = document.getElementById('pool-canvas');
  const canvas3d = document.getElementById('pool-canvas-3d');
  const renderer = new PoolRenderer(canvas);
  const renderer3d = new PoolRenderer3D(canvas3d);
  let viewMode = '3d'; // '3d' (Player POV) | '2d'
  let peekTop = false;
  let lastDragX = 0;
  const ai = new PoolAI();

  let rules = new PoolRules('8ball');
  let playType = 'local2p'; // 'local2p' | 'ai' | 'online'
  let myPlayerIndex = 1; // 1 or 2 in online mode
  let playerNames = { 1: 'Bạn', 2: 'Người chơi 2' };

  // Aim & Shot State
  const TURN_TIME_SEC = 30; // Standard tournament 30s shot clock
  let turnDeadline = Date.now() + TURN_TIME_SEC * 1000;
  let lastRenderedSec = -1;
  let timeoutTriggeredForTurn = false;
  let aimAngle = 0;
  let shotPower = 0;
  let spinX = 0;
  let spinY = 0;
  let isAimDragging = false;
  let isPowerDragging = false;
  let isSpinDragging = false;
  let isPlacingCue = false;
  let lastAimSent = 0;
  let shotWasExecutedByMe = false;

  // DOM Elements
  const lobbyModal = document.getElementById('lobby-modal');
  const gameoverModal = document.getElementById('gameover-modal');
  const playerNameInput = document.getElementById('player-name-input');
  const roomCodeInput = document.getElementById('room-code-input');
  const onlineStatus = document.getElementById('online-status');
  const onlineStatusText = document.getElementById('online-status-text');
  const btnCopyInvite = document.getElementById('btn-copy-invite');
  const roomPill = document.getElementById('room-pill');
  const roomCodeLabel = document.getElementById('room-code-label');
  const toastBanner = document.getElementById('toast-banner');
  const bihHint = document.getElementById('bih-hint');
  const powerTrack = document.getElementById('power-track');
  const powerFill = document.getElementById('power-fill');
  const powerPct = document.getElementById('power-pct');
  const spinPad = document.getElementById('spin-pad');
  const spinDot = document.getElementById('spin-dot');
  const chatPanel = document.getElementById('chat-panel');
  const chatMessages = document.getElementById('chat-messages');
  const chatBadge = document.getElementById('chat-badge');
  let unreadChatCount = 0;

  // Restore saved nickname
  playerNameInput.value = localStorage.getItem('bida_name') || 'Cơ thủ';

  // Toast helper
  let toastTimer = null;
  function showToast(msg, duration = 2600) {
    toastBanner.textContent = msg;
    toastBanner.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastBanner.classList.add('hidden'), duration);
  }

  // Network setup
  const net = new PoolNetwork({
    onRoomCreated: (code) => {
      onlineStatus.classList.remove('hidden');
      onlineStatusText.textContent = `Phòng ${code} — Đang chờ bạn bè vào...`;
      btnCopyInvite.classList.remove('hidden');
    },
    onPeerJoined: (guestName) => {
      playerNames[1] = getPlayerName();
      playerNames[2] = guestName || 'Bạn bè';
      myPlayerIndex = 1;
      playType = 'online';
      startNewMatch(net.mode);
      net.sendRoom({
        type: 'WELCOME',
        hostName: playerNames[1],
        mode: net.mode,
        balls: physics.exportState(),
      });
      lobbyModal.classList.add('hidden');
      showToast(`${playerNames[2]} đã vào phòng! Bạn phá bi trước.`);
    },
    onWelcome: (msg) => {
      playerNames[1] = msg.hostName || 'Chủ phòng';
      playerNames[2] = getPlayerName();
      myPlayerIndex = 2;
      playType = 'online';
      rules = new PoolRules(msg.mode);
      rules.setupRack(physics);
      physics.importState(msg.balls);
      lobbyModal.classList.add('hidden');
      onlineStatus.classList.add('hidden');
      resetTurnTimer();
      updateHUD();
      showToast(`Đã ghép cặp với ${playerNames[1]}!`);
    },
    onGameMessage: (msg) => handleNetworkMessage(msg),
    onError: (err) => {
      onlineStatusText.textContent = err;
    },
  });

  function getPlayerName() {
    const v = playerNameInput.value.trim() || 'Cơ thủ';
    localStorage.setItem('bida_name', v);
    return v;
  }

  function handleNetworkMessage(msg) {
    if (msg.type === 'AIM') {
      aimAngle = msg.angle;
      shotPower = msg.power;
      updatePowerUI();
    } else if (msg.type === 'SHOT') {
      const cue = physics.getCueBall();
      if (cue && msg.cueX !== undefined) {
        cue.x = msg.cueX;
        cue.y = msg.cueY;
      }
      shotWasExecutedByMe = false;
      audio.playCueStrike(msg.power);
      physics.strikeCueBall(msg.angle, msg.power, msg.spinX, msg.spinY);
      shotPower = 0;
      updatePowerUI();
    } else if (msg.type === 'SYNC_STATE') {
      physics.importState(msg.balls);
      rules.turn = msg.turn;
      rules.isBreakShot = msg.isBreakShot;
      rules.ballInHand = msg.ballInHand;
      rules.groups = msg.groups;
      rules.tableOpen = msg.tableOpen;
      rules.pocketedBy = msg.pocketedBy;
      rules.winner = msg.winner;
      rules.winReason = msg.winReason;
      if (msg.toast) showToast(msg.toast);
      resetTurnTimer();
      updateHUD();
      if (rules.winner) showGameOver();
    } else if (msg.type === 'BIH_MOVE') {
      const cue = physics.getCueBall();
      if (cue) {
        cue.x = msg.x;
        cue.y = msg.y;
      }
    } else if (msg.type === 'CHAT') {
      appendChat(msg.name, msg.text);
      showToast(`💬 ${msg.name}: ${msg.text}`, 2400);
      if (chatPanel.classList.contains('hidden')) {
        unreadChatCount++;
        chatBadge.textContent = unreadChatCount;
        chatBadge.classList.remove('hidden');
      }
    } else if (msg.type === 'REMATCH') {
      if (net.isHost) {
        startNewMatch(rules.mode);
        net.sendRoom({
          type: 'REMATCH_START',
          balls: physics.exportState(),
        });
      }
    } else if (msg.type === 'REMATCH_START') {
      rules.reset();
      rules.setupRack(physics);
      physics.importState(msg.balls);
      gameoverModal.classList.add('hidden');
      resetTurnTimer();
      updateHUD();
      showToast('Bắt đầu ván mới!');
    }
  }

  function isMyTurn() {
    if (rules.winner) return false;
    if (physics.isMoving) return false;
    if (playType === 'local2p') return true;
    if (playType === 'ai') return rules.turn === 1;
    if (playType === 'online') return rules.turn === myPlayerIndex;
    return true;
  }

  function resetTurnTimer() {
    turnDeadline = Date.now() + TURN_TIME_SEC * 1000;
    lastRenderedSec = -1;
    timeoutTriggeredForTurn = false;
    updateTimerUI();
  }

  function getTurnTimeLeft() {
    return (turnDeadline - Date.now()) / 1000;
  }

  function updateTimerUI() {
    const el = document.getElementById('turn-timer');
    if (!el) return;
    if (rules.mode === 'practice' || rules.winner) {
      el.classList.add('hidden');
      return;
    }
    el.classList.remove('hidden');
    const sec = Math.max(0, Math.ceil(getTurnTimeLeft()));
    if (sec === lastRenderedSec) return;
    lastRenderedSec = sec;
    el.textContent = `⏱ ${sec}s`;
    el.classList.toggle('warning', sec <= 10 && sec > 5);
    el.classList.toggle('danger', sec <= 5);
  }

  function handleTurnTimeout() {
    if (timeoutTriggeredForTurn) return;
    timeoutTriggeredForTurn = true;
    const other = rules.turn === 1 ? 2 : 1;
    rules.turn = other;
    rules.ballInHand = true;
    rules.isBreakShot = false;
    shotPower = 0;
    isAimDragging = false;
    isPowerDragging = false;
    isPlacingCue = false;
    updatePowerUI();
    audio.playFoul();
    const msg = `⏰ Hết giờ (${TURN_TIME_SEC}s)! Đối thủ được đặt bi.`;
    showToast(msg);
    resetTurnTimer();
    updateHUD();

    if (playType === 'online') {
      net.sendRoom({
        type: 'SYNC_STATE',
        balls: physics.exportState(),
        turn: rules.turn,
        isBreakShot: rules.isBreakShot,
        ballInHand: rules.ballInHand,
        groups: rules.groups,
        tableOpen: rules.tableOpen,
        pocketedBy: rules.pocketedBy,
        winner: rules.winner,
        winReason: rules.winReason,
        toast: msg,
      });
    } else if (playType === 'ai' && rules.turn === 2) {
      setTimeout(runAITurn, 300);
    }
  }

  function checkTurnClock() {
    if (physics.isMoving || rules.winner || rules.mode === 'practice') return;
    if (!lobbyModal.classList.contains('hidden')) return;

    const left = getTurnTimeLeft();
    updateTimerUI();

    if (playType !== 'online' || rules.turn === myPlayerIndex) {
      if (left <= 0) handleTurnTimeout();
    } else {
      // Grace period if opponent's tab is backgrounded/AFK
      if (left <= -1.5) handleTurnTimeout();
    }
  }

  // Background-tab safe 500ms interval fallback for turn clock
  setInterval(checkTurnClock, 500);

  function startNewMatch(mode) {
    rules = new PoolRules(mode);
    rules.setupRack(physics);
    shotPower = 0;
    spinX = 0;
    spinY = 0;
    updateSpinUI();
    updatePowerUI();
    resetTurnTimer();
    gameoverModal.classList.add('hidden');
    updateHUD();
  }

  function updateHUD() {
    document.getElementById('p1-name').textContent = playerNames[1];
    document.getElementById('p2-name').textContent =
      rules.mode === 'practice' ? 'Tập luyện' : playerNames[2];

    const p1Card = document.getElementById('p1-card');
    const p2Card = document.getElementById('p2-card');
    p1Card.classList.toggle('active', rules.turn === 1);
    p2Card.classList.toggle('active', rules.turn === 2 && rules.mode !== 'practice');

    const modeNames = { '8ball': '8 BI • KỸ NĂNG', '9ball': '9 BI • KỸ NĂNG', practice: 'TẬP LUYỆN' };
    document.getElementById('hud-mode').textContent = modeNames[rules.mode];

    const turnEl = document.getElementById('turn-status');
    if (rules.mode === 'practice') {
      turnEl.textContent = 'Chế độ tự do';
    } else if (playType === 'online') {
      turnEl.textContent = rules.turn === myPlayerIndex ? '🟢 Lượt của Bạn' : `⏳ Lượt ${playerNames[rules.turn]}`;
    } else {
      turnEl.textContent = `Lượt ${playerNames[rules.turn]}`;
    }

    // Group badges
    const g1 = document.getElementById('p1-group');
    const g2 = document.getElementById('p2-group');
    if (rules.mode === '8ball') {
      const formatGroup = (pNum) => {
        const g = rules.groups[pNum];
        if (!g) return '';
        if (!rules.hasRemainingGroup(physics, g)) return 'CHỐT BI 8 🎱';
        return g === 'solid' ? 'TRƠN (1-7)' : 'SỌC (9-15)';
      };
      g1.textContent = formatGroup(1);
      g2.textContent = formatGroup(2);
    } else if (rules.mode === '9ball') {
      const lowest = rules.getLowestBallId(physics);
      g1.textContent = lowest ? `Mục tiêu: #${lowest}` : '';
      g2.textContent = '';
    } else {
      g1.textContent = '';
      g2.textContent = '';
    }

    // Pocketed mini balls
    renderMiniBalls('p1-balls', rules.pocketedBy[1]);
    renderMiniBalls('p2-balls', rules.pocketedBy[2]);

    // Room pill
    if (playType === 'online' && net.roomCode) {
      roomPill.classList.remove('hidden');
      roomCodeLabel.textContent = `PHÒNG: ${net.roomCode}`;
    } else {
      roomPill.classList.add('hidden');
    }

    // Ball-in-hand banner
    const showBih = rules.ballInHand && isMyTurn();
    bihHint.classList.toggle('hidden', !showBih);
    if (showBih) {
      bihHint.textContent = rules.isBreakShot
        ? '✋ Phá bi: Kéo bi cái trong vùng sau vạch trắng để chọn vị trí'
        : '✋ Đặt bi: Kéo bi cái đến vị trí muốn đặt trên bàn';
    }
  }

  function renderMiniBalls(elId, ids) {
    const el = document.getElementById(elId);
    el.innerHTML = '';
    for (const id of ids) {
      const span = document.createElement('span');
      span.className = 'mini-ball';
      span.style.background = BALL_COLORS[id] || '#fff';
      if (id === 8) span.style.color = '#fff';
      span.textContent = id;
      el.appendChild(span);
    }
  }

  function executeShot() {
    if (!isMyTurn() || shotPower < 0.02) {
      shotPower = 0;
      updatePowerUI();
      return;
    }
    const cue = physics.getCueBall();
    if (!cue) return;

    rules.ballInHand = false;
    bihHint.classList.add('hidden');
    shotWasExecutedByMe = true;
    audio.playCueStrike(shotPower);

    if (playType === 'online') {
      net.sendRoom({
        type: 'SHOT',
        angle: aimAngle,
        power: shotPower,
        spinX,
        spinY,
        cueX: cue.x,
        cueY: cue.y,
      });
    }

    physics.strikeCueBall(aimAngle, shotPower, spinX, spinY);
    shotPower = 0;
    updatePowerUI();
  }

  function showGameOver() {
    audio.playWin();
    const isWin =
      playType === 'online'
        ? rules.winner === myPlayerIndex
        : playType === 'ai'
        ? rules.winner === 1
        : true;
    document.getElementById('gameover-icon').textContent = isWin ? '🏆' : '💔';
    document.getElementById('gameover-title').textContent =
      playType === 'local2p' ? `${playerNames[rules.winner]} THẮNG!` : isWin ? 'CHIẾN THẮNG!' : 'THUA CUỘC!';
    document.getElementById('gameover-reason').textContent = rules.winReason;
    gameoverModal.classList.remove('hidden');
  }

  // Main Animation & Fixed-60Hz Physics Loop (ensures 60Hz & 120Hz+ screens stay in sync)
  let wasMoving = false;
  let lastFrameTime = performance.now();
  let accumulator = 0;
  const FIXED_STEP_MS = 1000 / 60;

  function loop(now = performance.now()) {
    const elapsed = Math.min(100, now - lastFrameTime);
    lastFrameTime = now;
    accumulator += elapsed;

    let moving = physics.isMoving;
    while (accumulator >= FIXED_STEP_MS) {
      moving = physics.step();
      accumulator -= FIXED_STEP_MS;

      if (wasMoving && !moving) {
        // Shot just finished!
        if (playType !== 'online' || shotWasExecutedByMe) {
          const res = rules.evaluateShot(physics, physics.shotEvents);
          if (res.foul) audio.playFoul();
          showToast(res.message);
          resetTurnTimer();
          updateHUD();

          if (playType === 'online') {
            net.sendRoom({
              type: 'SYNC_STATE',
              balls: physics.exportState(),
              turn: rules.turn,
              isBreakShot: rules.isBreakShot,
              ballInHand: rules.ballInHand,
              groups: rules.groups,
              tableOpen: rules.tableOpen,
              pocketedBy: rules.pocketedBy,
              winner: rules.winner,
              winReason: rules.winReason,
              toast: res.message,
            });
          }

          if (res.gameOver) {
            showGameOver();
          } else if (playType === 'ai' && rules.turn === 2) {
            setTimeout(runAITurn, 300);
          }
        }
      }
      wasMoving = moving;
    }

    // Update 30s turn shot clock when table is idle in an active match
    checkTurnClock();

    const showCue = !moving && !rules.winner && !isPlacingCue;
    const activeRenderer = viewMode === '3d' ? renderer3d : renderer;
    activeRenderer.render(physics, {
      showCue,
      angle: aimAngle,
      power: shotPower,
      ballInHand: rules.ballInHand && isMyTurn(),
      peekTop,
    });

    requestAnimationFrame(loop);
  }

  function runAITurn() {
    if (rules.winner || rules.turn !== 2 || physics.isMoving) return;
    if (rules.ballInHand) {
      // AI places cue ball at a clean spot
      const cue = physics.getCueBall();
      cue.x = TABLE_W * 0.25;
      cue.y = TABLE_H * (0.3 + Math.random() * 0.4);
      rules.ballInHand = false;
    }
    const shot = ai.computeShot(physics, rules);
    if (shot) {
      aimAngle = shot.angle;
      audio.playCueStrike(shot.power);
      physics.strikeCueBall(shot.angle, shot.power, shot.spinX, shot.spinY);
    }
  }

  // Canvas Input (Aiming & Ball-in-Hand)
  function isValidCuePos(x, y) {
    const maxX = rules.isBreakShot ? TABLE_W * 0.25 : TABLE_W - BALL_R - 2;
    if (x < BALL_R + 2 || x > maxX || y < BALL_R + 2 || y > TABLE_H - BALL_R - 2) {
      return false;
    }
    for (const b of physics.balls) {
      if (b.id === 0 || b.pocketed) continue;
      if (Math.hypot(b.x - x, b.y - y) < BALL_R * 2 + 1) return false;
    }
    return true;
  }

  function getActiveRenderer() {
    return viewMode === '3d' ? renderer3d : renderer;
  }

  function onCanvasDown(e) {
    if (!isMyTurn()) return;
    const pt = getActiveRenderer().clientToTable(e.clientX, e.clientY);
    const cue = physics.getCueBall();
    if (!cue) return;

    if (rules.ballInHand && Math.hypot(pt.x - cue.x, pt.y - cue.y) < BALL_R * 2.8) {
      isPlacingCue = true;
      return;
    }

    isAimDragging = true;
    lastDragX = e.clientX;
    if (viewMode === '2d') {
      updateAimFromPoint(pt, e.shiftKey);
    }
  }

  function onCanvasMove(e) {
    if (!isMyTurn()) return;
    const cue = physics.getCueBall();
    if (!cue) return;

    if (isPlacingCue) {
      const pt = getActiveRenderer().clientToTable(e.clientX, e.clientY);
      const maxX = rules.isBreakShot ? TABLE_W * 0.25 : TABLE_W - BALL_R - 2;
      const clampedX = Math.max(BALL_R + 2, Math.min(maxX, pt.x));
      const clampedY = Math.max(BALL_R + 2, Math.min(TABLE_H - BALL_R - 2, pt.y));
      if (isValidCuePos(clampedX, clampedY)) {
        cue.x = clampedX;
        cue.y = clampedY;
        if (playType === 'online') net.sendRoom({ type: 'BIH_MOVE', x: cue.x, y: cue.y });
      }
      return;
    }

    if (isAimDragging) {
      if (viewMode === '3d') {
        const dx = e.clientX - lastDragX;
        lastDragX = e.clientX;
        aimAngle += dx * (e.shiftKey ? 0.0012 : 0.0042);
        syncAimOverNetwork();
      } else {
        const pt = renderer.clientToTable(e.clientX, e.clientY);
        updateAimFromPoint(pt, e.shiftKey);
      }
    }
  }

  function onCanvasUp() {
    isPlacingCue = false;
    isAimDragging = false;
  }

  function updateAimFromPoint(pt, precision) {
    const cue = physics.getCueBall();
    if (!cue) return;
    const targetAngle = Math.atan2(pt.y - cue.y, pt.x - cue.x);
    if (precision) {
      // Smooth fine-aim when holding Shift
      let diff = targetAngle - aimAngle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      aimAngle += diff * 0.15;
    } else {
      aimAngle = targetAngle;
    }
    syncAimOverNetwork();
  }

  function syncAimOverNetwork() {
    if (playType !== 'online') return;
    const now = performance.now();
    if (now - lastAimSent > 70) {
      lastAimSent = now;
      net.sendRoom({ type: 'AIM', angle: aimAngle, power: shotPower });
    }
  }

  for (const c of [canvas, canvas3d]) {
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      onCanvasDown(e);
    });
    c.addEventListener('pointermove', onCanvasMove);
    c.addEventListener('pointerup', onCanvasUp);
  }

  // Power Bar Input
  function updatePowerUI() {
    const pct = Math.round(shotPower * 100);
    powerFill.style.height = `${pct}%`;
    powerPct.textContent = `${pct}%`;
  }

  let powerStartY = 0;
  let powerStartX = 0;
  powerTrack.addEventListener('pointerdown', (e) => {
    if (!isMyTurn()) return;
    isPowerDragging = true;
    powerStartY = e.clientY;
    powerStartX = e.clientX;
    powerTrack.setPointerCapture(e.pointerId);
  });

  powerTrack.addEventListener('pointermove', (e) => {
    if (!isPowerDragging) return;
    const rect = powerTrack.getBoundingClientRect();
    const isHorizontal = rect.width > rect.height;
    const delta = isHorizontal ? e.clientX - powerStartX : e.clientY - powerStartY;
    const span = isHorizontal ? rect.width : rect.height;
    shotPower = Math.max(0, Math.min(1, delta / (span * 0.85)));
    updatePowerUI();
    syncAimOverNetwork();
  });

  powerTrack.addEventListener('pointerup', () => {
    if (!isPowerDragging) return;
    isPowerDragging = false;
    executeShot();
  });

  // Spin Pad Input
  function updateSpinUI() {
    spinDot.style.left = `${50 + spinX * 36}%`;
    spinDot.style.top = `${50 - spinY * 36}%`;
  }

  function setSpinFromEvent(e) {
    const rect = spinPad.getBoundingClientRect();
    let nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    let ny = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
    const len = Math.hypot(nx, ny);
    if (len > 1) {
      nx /= len;
      ny /= len;
    }
    spinX = nx;
    spinY = ny;
    updateSpinUI();
  }

  spinPad.addEventListener('pointerdown', (e) => {
    isSpinDragging = true;
    spinPad.setPointerCapture(e.pointerId);
    setSpinFromEvent(e);
  });
  spinPad.addEventListener('pointermove', (e) => {
    if (isSpinDragging) setSpinFromEvent(e);
  });
  spinPad.addEventListener('pointerup', () => (isSpinDragging = false));
  document.getElementById('btn-reset-spin').addEventListener('click', () => {
    spinX = 0;
    spinY = 0;
    updateSpinUI();
  });

  // Fine Aim Nudge & Keyboard
  document.getElementById('btn-aim-left').addEventListener('click', () => {
    if (!isMyTurn()) return;
    aimAngle -= 0.012;
    syncAimOverNetwork();
  });
  document.getElementById('btn-aim-right').addEventListener('click', () => {
    if (!isMyTurn()) return;
    aimAngle += 0.012;
    syncAimOverNetwork();
  });

  window.addEventListener('keydown', (e) => {
    if (document.activeElement.tagName === 'INPUT') return;
    if (!isMyTurn()) return;
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
      aimAngle -= e.shiftKey ? 0.003 : 0.015;
      syncAimOverNetwork();
    } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
      aimAngle += e.shiftKey ? 0.003 : 0.015;
      syncAimOverNetwork();
    }
  });

  // Tool Buttons
  document.getElementById('btn-camera-mode').addEventListener('click', (e) => {
    viewMode = viewMode === '3d' ? '2d' : '3d';
    canvas3d.classList.toggle('hidden', viewMode !== '3d');
    canvas.classList.toggle('hidden', viewMode !== '2d');
    e.currentTarget.textContent = viewMode === '3d' ? '🎥 Góc nhìn: 3D' : '📐 Góc nhìn: 2D';
    handleResize();
    showToast(viewMode === '3d' ? 'Đã bật góc nhìn 3D POV!' : 'Đã chuyển góc nhìn 2D!');
  });

  const btnPeekTop = document.getElementById('btn-peek-top');
  btnPeekTop.addEventListener('pointerdown', () => (peekTop = true));
  btnPeekTop.addEventListener('pointerup', () => (peekTop = false));
  btnPeekTop.addEventListener('pointerleave', () => (peekTop = false));

  document.getElementById('btn-sound').addEventListener('click', (e) => {
    const muted = audio.toggleMute();
    e.currentTarget.textContent = muted ? '🔇 Tắt tiếng' : '🔊 Âm thanh';
  });

  document.getElementById('btn-felt').addEventListener('click', () => {
    const theme = renderer.cycleTheme();
    renderer3d.cycleTheme();
    showToast(`Màu bàn: ${theme.name}`);
  });

  function toggleChatPanel(forceState) {
    const show = forceState !== undefined ? forceState : chatPanel.classList.contains('hidden');
    chatPanel.classList.toggle('hidden', !show);
    if (show) {
      unreadChatCount = 0;
      chatBadge.classList.add('hidden');
    }
  }

  document.getElementById('btn-chat-toggle').addEventListener('click', () => toggleChatPanel());
  document.getElementById('btn-chat-open').addEventListener('click', () => toggleChatPanel());
  document.getElementById('btn-chat-close').addEventListener('click', () => toggleChatPanel(false));

  document.getElementById('btn-menu').addEventListener('click', () => {
    net.disconnect();
    onlineStatus.classList.add('hidden');
    lobbyModal.classList.remove('hidden');
  });

  // Chat
  function appendChat(name, text) {
    const div = document.createElement('div');
    div.className = 'chat-msg';
    div.innerHTML = `<b>${name}:</b> ${text.replace(/</g, '&lt;')}`;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function sendChatMessage(text) {
    const myName = getPlayerName();
    appendChat(myName, text);
    showToast(`💬 ${myName}: ${text}`, 1800);
    if (playType === 'online') net.sendRoom({ type: 'CHAT', name: myName, text });
  }

  document.querySelectorAll('.emote-btn, .icon-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      sendChatMessage(btn.dataset.msg);
    });
  });

  document.getElementById('chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    sendChatMessage(text);
  });

  // Lobby Controls
  let selectedMode = '8ball';
  document.querySelectorAll('.mode-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mode-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      selectedMode = btn.dataset.mode;
    });
  });

  document.getElementById('btn-create-room').addEventListener('click', () => {
    if (selectedMode === 'practice') {
      showToast('Chế độ Tập luyện chỉ chơi Offline!');
      return;
    }
    onlineStatus.classList.remove('hidden');
    onlineStatusText.textContent = 'Đang tạo phòng...';
    btnCopyInvite.classList.add('hidden');
    net.createRoom(getPlayerName(), selectedMode);
  });

  document.getElementById('btn-quick-match').addEventListener('click', () => {
    if (selectedMode === 'practice') selectedMode = '8ball';
    onlineStatus.classList.remove('hidden');
    onlineStatusText.textContent = 'Đang tìm đối thủ ghép cặp...';
    btnCopyInvite.classList.add('hidden');
    net.quickMatch(getPlayerName(), selectedMode);
  });

  document.getElementById('btn-join-room').addEventListener('click', () => {
    const code = roomCodeInput.value.trim();
    if (!code) {
      showToast('Vui lòng nhập mã phòng!');
      return;
    }
    onlineStatus.classList.remove('hidden');
    onlineStatusText.textContent = `Đang vào phòng ${code}...`;
    btnCopyInvite.classList.add('hidden');
    net.joinRoom(code, getPlayerName());
  });

  document.getElementById('btn-cancel-online').addEventListener('click', () => {
    net.disconnect();
    onlineStatus.classList.add('hidden');
  });

  function copyInviteLink() {
    if (!net.roomCode) return;
    const url = `${location.origin}${location.pathname}?room=${net.roomCode}`;
    navigator.clipboard.writeText(url).then(() => {
      showToast('Đã sao chép link mời! Gửi cho bạn bè để vào chơi.');
    });
  }

  btnCopyInvite.addEventListener('click', copyInviteLink);
  roomPill.addEventListener('click', copyInviteLink);

  document.getElementById('btn-local-2p').addEventListener('click', () => {
    playType = 'local2p';
    playerNames = { 1: getPlayerName(), 2: 'Người chơi 2' };
    startNewMatch(selectedMode);
    lobbyModal.classList.add('hidden');
  });

  document.getElementById('btn-vs-ai').addEventListener('click', () => {
    playType = 'ai';
    playerNames = { 1: getPlayerName(), 2: 'Máy (AI)' };
    startNewMatch(selectedMode === 'practice' ? '8ball' : selectedMode);
    lobbyModal.classList.add('hidden');
  });

  // Game Over Buttons
  document.getElementById('btn-rematch').addEventListener('click', () => {
    if (playType === 'online') {
      if (net.isHost) {
        startNewMatch(rules.mode);
        net.sendRoom({ type: 'REMATCH_START', balls: physics.exportState() });
      } else {
        net.sendRoom({ type: 'REMATCH' });
        showToast('Đã gửi yêu cầu chơi ván mới...');
      }
    } else {
      startNewMatch(rules.mode);
    }
  });

  document.getElementById('btn-back-lobby').addEventListener('click', () => {
    gameoverModal.classList.add('hidden');
    net.disconnect();
    lobbyModal.classList.remove('hidden');
  });

  // Resize handling
  function handleResize() {
    const wrapper = document.getElementById('canvas-wrapper');
    renderer.resize(wrapper.clientWidth - 12, wrapper.clientHeight - 12);
    renderer3d.resize(wrapper.clientWidth - 12, wrapper.clientHeight - 12);
  }
  window.addEventListener('resize', handleResize);
  handleResize();

  // Auto-join if ?room=XXXX is in URL
  const params = new URLSearchParams(location.search);
  const urlRoom = params.get('room');
  if (urlRoom) {
    roomCodeInput.value = urlRoom;
    onlineStatus.classList.remove('hidden');
    onlineStatusText.textContent = `Đang tự động vào phòng ${urlRoom}...`;
    net.joinRoom(urlRoom, getPlayerName());
  }

  // Initial background rack
  startNewMatch('8ball');
  requestAnimationFrame(loop);
})();
