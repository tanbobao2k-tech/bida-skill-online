// HTML5 Canvas Renderer for Pro Pool Table & Balls
// STRICTLY NO AIMING GUIDELINE — Pure skill!

const FELT_THEMES = [
  { name: 'Xanh Lục Cổ Điển', main: '#0f6b43', edge: '#09452b', cushion: '#0b5233' },
  { name: 'Xanh Dương Giải Đấu', main: '#16528e', edge: '#0d345c', cushion: '#114173' },
  { name: 'Đỏ Rượu Vang', main: '#7a1c28', edge: '#4d1018', cushion: '#61151f' },
];

class PoolRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.railSize = 54; // Wood rail thickness in logical units
    this.totalW = TABLE_W + this.railSize * 2;
    this.totalH = TABLE_H + this.railSize * 2;
    this.themeIndex = 0;
    this.scale = 1;
    this.dpr = window.devicePixelRatio || 1;
  }

  cycleTheme() {
    this.themeIndex = (this.themeIndex + 1) % FELT_THEMES.length;
    return FELT_THEMES[this.themeIndex];
  }

  resize(containerWidth, containerHeight) {
    const aspect = this.totalW / this.totalH;
    let w = containerWidth;
    let h = w / aspect;
    if (h > containerHeight) {
      h = containerHeight;
      w = h * aspect;
    }
    w = Math.max(320, Math.floor(w));
    h = Math.max(180, Math.floor(h));

    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.canvas.width = Math.floor(w * this.dpr);
    this.canvas.height = Math.floor(h * this.dpr);
    this.scale = w / this.totalW;
  }

  // Convert client mouse/touch coordinates to logical table coordinates (0..TABLE_W, 0..TABLE_H)
  clientToTable(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const x = (clientX - rect.left) / this.scale - this.railSize;
    const y = (clientY - rect.top) / this.scale - this.railSize;
    return { x, y };
  }

  render(physics, aimState) {
    const ctx = this.ctx;
    ctx.save();
    ctx.scale(this.dpr * this.scale, this.dpr * this.scale);

    this.drawTable(ctx);

    // Draw balls
    for (const ball of physics.balls) {
      if (!ball.pocketed) {
        this.drawBall(ctx, ball, aimState.ballInHand && ball.id === 0);
      }
    }

    // Draw cue stick ONLY when balls are stationary and it's an active turn (NO aiming line!)
    if (aimState.showCue) {
      const cueBall = physics.getCueBall();
      if (cueBall && !cueBall.pocketed) {
        this.drawCueStick(ctx, cueBall, aimState.angle, aimState.power);
      }
    }

    ctx.restore();
  }

  drawTable(ctx) {
    const r = this.railSize;
    const theme = FELT_THEMES[this.themeIndex];

    // 1. Outer Mahogany Wood Frame
    const woodGrad = ctx.createLinearGradient(0, 0, this.totalW, this.totalH);
    woodGrad.addColorStop(0, '#5c2d16');
    woodGrad.addColorStop(0.5, '#3e1d0d');
    woodGrad.addColorStop(1, '#2b1206');

    ctx.fillStyle = woodGrad;
    this.roundRect(ctx, 0, 0, this.totalW, this.totalH, 26);
    ctx.fill();

    // Subtle inner wood bevel
    ctx.strokeStyle = 'rgba(255, 210, 160, 0.14)';
    ctx.lineWidth = 2;
    this.roundRect(ctx, 2, 2, this.totalW - 4, this.totalH - 4, 24);
    ctx.stroke();

    // Brass corner plates
    ctx.fillStyle = '#c59b47';
    const corners = [
      [0, 0],
      [this.totalW - 48, 0],
      [0, this.totalH - 48],
      [this.totalW - 48, this.totalH - 48],
    ];
    for (const [cx, cy] of corners) {
      ctx.save();
      ctx.beginPath();
      this.roundRect(ctx, cx + 4, cy + 4, 40, 40, 12);
      ctx.fillStyle = 'rgba(212, 175, 55, 0.22)';
      ctx.fill();
      ctx.restore();
    }

    // 2. Playing Surface (Felt)
    ctx.save();
    ctx.translate(r, r);

    const feltGrad = ctx.createRadialGradient(
      TABLE_W / 2,
      TABLE_H / 2,
      40,
      TABLE_W / 2,
      TABLE_H / 2,
      TABLE_W * 0.65
    );
    feltGrad.addColorStop(0, theme.main);
    feltGrad.addColorStop(1, theme.edge);
    ctx.fillStyle = feltGrad;
    ctx.fillRect(-10, -10, TABLE_W + 20, TABLE_H + 20);

    // Cushions (inner border)
    ctx.strokeStyle = theme.cushion;
    ctx.lineWidth = 10;
    ctx.strokeRect(-5, -5, TABLE_W + 10, TABLE_H + 10);

    // Head string (Baulk line) & Foot spot
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(TABLE_W * 0.25, 0);
    ctx.lineTo(TABLE_W * 0.25, TABLE_H);
    ctx.stroke();

    // Center & Foot spots
    ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
    for (const sx of [TABLE_W * 0.25, TABLE_W * 0.5, TABLE_W * 0.74]) {
      ctx.beginPath();
      ctx.arc(sx, TABLE_H / 2, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Diamond sights on rails (essential for skill-based bank shots!)
    ctx.fillStyle = '#e2c275';
    for (let i = 1; i <= 7; i++) {
      if (i === 4) continue; // skip side pocket
      const dx = (TABLE_W / 8) * i;
      this.drawDiamond(ctx, dx, -r * 0.52);
      this.drawDiamond(ctx, dx, TABLE_H + r * 0.52);
    }
    for (let i = 1; i <= 3; i++) {
      const dy = (TABLE_H / 4) * i;
      this.drawDiamond(ctx, -r * 0.52, dy);
      this.drawDiamond(ctx, TABLE_W + r * 0.52, dy);
    }

    // 3. Pockets
    for (const p of POCKETS) {
      // Outer leather rim
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r + 5, 0, Math.PI * 2);
      ctx.fillStyle = '#1a0e07';
      ctx.fill();

      // Deep hole
      const pGrad = ctx.createRadialGradient(p.x, p.y, 4, p.x, p.y, p.r);
      pGrad.addColorStop(0, '#000000');
      pGrad.addColorStop(0.8, '#0a0a0a');
      pGrad.addColorStop(1, '#1f2937');
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = pGrad;
      ctx.fill();
    }

    ctx.restore();
  }

  drawDiamond(ctx, x, y) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-3.2, -3.2, 6.4, 6.4);
    ctx.restore();
  }

  drawBall(ctx, ball, highlightCue) {
    const x = ball.x + this.railSize;
    const y = ball.y + this.railSize;
    const r = BALL_R;

    ctx.save();

    // Drop shadow
    ctx.beginPath();
    ctx.arc(x + 3, y + 4, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.38)';
    ctx.fill();

    // Highlight ring for Ball-in-Hand
    if (highlightCue) {
      ctx.beginPath();
      ctx.arc(x, y, r + 5, 0, Math.PI * 2);
      ctx.strokeStyle = '#34d399';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }

    // Base sphere
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.clip();

    if (ball.isStripe) {
      // White base with colored stripe band
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
      ctx.fillStyle = ball.color;
      ctx.fillRect(x - r, y - r * 0.56, r * 2, r * 1.12);
    } else {
      ctx.fillStyle = ball.color;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }

    // Number circle on object balls
    if (ball.id > 0) {
      ctx.beginPath();
      ctx.arc(x, y, r * 0.48, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();

      ctx.fillStyle = '#0f172a';
      ctx.font = '800 9.5px "Be Vietnam Pro", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(ball.id), x, y + 0.5);
    }

    // 3D Spherical shading overlay
    const shade = ctx.createRadialGradient(
      x - r * 0.35,
      y - r * 0.35,
      r * 0.1,
      x,
      y,
      r
    );
    shade.addColorStop(0, 'rgba(255, 255, 255, 0.45)');
    shade.addColorStop(0.35, 'rgba(255, 255, 255, 0.05)');
    shade.addColorStop(0.8, 'rgba(0, 0, 0, 0.22)');
    shade.addColorStop(1, 'rgba(0, 0, 0, 0.55)');
    ctx.fillStyle = shade;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);

    ctx.restore();
  }

  drawCueStick(ctx, cueBall, angle, powerPct) {
    const cx = cueBall.x + this.railSize;
    const cy = cueBall.y + this.railSize;

    // Pull-back distance from cue ball
    const pullback = 18 + powerPct * 95;
    const stickLen = 340;

    ctx.save();
    ctx.translate(cx, cy);
    // Stick sits BEHIND the cue ball (opposite to shot angle)
    ctx.rotate(angle + Math.PI);

    // Subtle shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.moveTo(pullback, 2);
    ctx.lineTo(pullback + stickLen, 5);
    ctx.lineTo(pullback + stickLen, 10);
    ctx.lineTo(pullback, 5);
    ctx.closePath();
    ctx.fill();

    // Blue chalk tip
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(pullback, -2.5, 4, 5);

    // White ferrule
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(pullback + 4, -2.6, 8, 5.2);

    // Maple shaft
    const shaftGrad = ctx.createLinearGradient(pullback + 12, 0, pullback + 185, 0);
    shaftGrad.addColorStop(0, '#f3d5a5');
    shaftGrad.addColorStop(1, '#d4a36a');
    ctx.fillStyle = shaftGrad;
    ctx.beginPath();
    ctx.moveTo(pullback + 12, -2.6);
    ctx.lineTo(pullback + 185, -4.4);
    ctx.lineTo(pullback + 185, 4.4);
    ctx.lineTo(pullback + 12, 2.6);
    ctx.closePath();
    ctx.fill();

    // Carbon/Ebony butt
    const buttGrad = ctx.createLinearGradient(pullback + 185, 0, pullback + stickLen, 0);
    buttGrad.addColorStop(0, '#1e293b');
    buttGrad.addColorStop(0.5, '#7c2d12');
    buttGrad.addColorStop(1, '#0f172a');
    ctx.fillStyle = buttGrad;
    ctx.beginPath();
    ctx.moveTo(pullback + 185, -4.4);
    ctx.lineTo(pullback + stickLen, -6.5);
    ctx.lineTo(pullback + stickLen, 6.5);
    ctx.lineTo(pullback + 185, 4.4);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
}
