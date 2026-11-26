// HTML5 Canvas Renderer for Pro VIP Pool Table & Balls
// STRICTLY NO AIMING GUIDELINE — Pure skill!

const FELT_THEMES = [
  { name: 'Xanh Lục Hoàng Gia', main: '#0f7449', mid: '#0b5c39', edge: '#063822', cushion: '#094a2e' },
  { name: 'Xanh Dương Giải Đấu', main: '#185b9c', mid: '#12477a', edge: '#0a2a4a', cushion: '#0e3963' },
  { name: 'Đỏ Nhung VIP', main: '#851e2c', mid: '#63141f', edge: '#3b0910', cushion: '#500f18' },
];

class PoolRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.railSize = 56;
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

    for (const ball of physics.balls) {
      if (!ball.pocketed) {
        this.drawBall(ctx, ball, aimState.ballInHand && ball.id === 0);
      }
    }

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

    // 1. Luxury Mahogany & Walnut Frame
    const woodGrad = ctx.createLinearGradient(0, 0, this.totalW, this.totalH);
    woodGrad.addColorStop(0, '#6b3419');
    woodGrad.addColorStop(0.3, '#4a210e');
    woodGrad.addColorStop(0.7, '#381708');
    woodGrad.addColorStop(1, '#240d04');

    ctx.fillStyle = woodGrad;
    this.roundRect(ctx, 0, 0, this.totalW, this.totalH, 28);
    ctx.fill();

    // Subtle wood grain sheen
    ctx.strokeStyle = 'rgba(255, 215, 165, 0.16)';
    ctx.lineWidth = 2;
    this.roundRect(ctx, 2, 2, this.totalW - 4, this.totalH - 4, 26);
    ctx.stroke();

    // Inner gold-trimmed wood molding
    ctx.strokeStyle = 'rgba(212, 175, 55, 0.25)';
    ctx.lineWidth = 1.5;
    this.roundRect(ctx, r - 12, r - 12, TABLE_W + 24, TABLE_H + 24, 10);
    ctx.stroke();

    // Polished Brass Corner & Side Pocket Castings
    const brassGrad = ctx.createLinearGradient(0, 0, 50, 50);
    brassGrad.addColorStop(0, '#f3d98b');
    brassGrad.addColorStop(0.5, '#c59b47');
    brassGrad.addColorStop(1, '#8c6623');

    const cornerPlates = [
      [2, 2],
      [this.totalW - 50, 2],
      [2, this.totalH - 50],
      [this.totalW - 50, this.totalH - 50],
    ];
    for (const [cx, cy] of cornerPlates) {
      ctx.save();
      this.roundRect(ctx, cx, cy, 48, 48, 16);
      ctx.fillStyle = brassGrad;
      ctx.globalAlpha = 0.28;
      ctx.fill();
      ctx.restore();
    }

    // 2. Playing Surface (Felt) with Tournament Overhead Spotlight
    ctx.save();
    ctx.translate(r, r);

    const feltGrad = ctx.createRadialGradient(
      TABLE_W / 2,
      TABLE_H / 2,
      30,
      TABLE_W / 2,
      TABLE_H / 2,
      TABLE_W * 0.62
    );
    feltGrad.addColorStop(0, theme.main);
    feltGrad.addColorStop(0.55, theme.mid);
    feltGrad.addColorStop(1, theme.edge);
    ctx.fillStyle = feltGrad;
    ctx.fillRect(-10, -10, TABLE_W + 20, TABLE_H + 20);

    // Subtle Cushion Inner Shadow onto Felt (3D depth)
    const shadowTop = ctx.createLinearGradient(0, 0, 0, 22);
    shadowTop.addColorStop(0, 'rgba(0, 0, 0, 0.42)');
    shadowTop.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = shadowTop;
    ctx.fillRect(0, 0, TABLE_W, 22);

    const shadowBot = ctx.createLinearGradient(0, TABLE_H - 22, 0, TABLE_H);
    shadowBot.addColorStop(0, 'rgba(0, 0, 0, 0)');
    shadowBot.addColorStop(1, 'rgba(0, 0, 0, 0.42)');
    ctx.fillStyle = shadowBot;
    ctx.fillRect(0, TABLE_H - 22, TABLE_W, 22);

    const shadowLeft = ctx.createLinearGradient(0, 0, 22, 0);
    shadowLeft.addColorStop(0, 'rgba(0, 0, 0, 0.38)');
    shadowLeft.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = shadowLeft;
    ctx.fillRect(0, 0, 22, TABLE_H);

    const shadowRight = ctx.createLinearGradient(TABLE_W - 22, 0, TABLE_W, 0);
    shadowRight.addColorStop(0, 'rgba(0, 0, 0, 0)');
    shadowRight.addColorStop(1, 'rgba(0, 0, 0, 0.38)');
    ctx.fillStyle = shadowRight;
    ctx.fillRect(TABLE_W - 22, 0, 22, TABLE_H);

    // Cushions (beveled inner border)
    ctx.strokeStyle = theme.cushion;
    ctx.lineWidth = 10;
    ctx.strokeRect(-5, -5, TABLE_W + 10, TABLE_H + 10);

    // Head string (Baulk line)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(TABLE_W * 0.25, 0);
    ctx.lineTo(TABLE_W * 0.25, TABLE_H);
    ctx.stroke();

    // VIP Center Crest: "Tân Vip"
    this.drawCenterEmblem(ctx);

    // Break & Foot spots
    ctx.fillStyle = 'rgba(255, 255, 255, 0.24)';
    for (const sx of [TABLE_W * 0.25, TABLE_W * 0.74]) {
      ctx.beginPath();
      ctx.arc(sx, TABLE_H / 2, 3.8, 0, Math.PI * 2);
      ctx.fill();
    }

    // Mother-of-pearl Diamond Sights on rails
    for (let i = 1; i <= 7; i++) {
      if (i === 4) continue;
      const dx = (TABLE_W / 8) * i;
      this.drawDiamond(ctx, dx, -r * 0.52);
      this.drawDiamond(ctx, dx, TABLE_H + r * 0.52);
    }
    for (let i = 1; i <= 3; i++) {
      const dy = (TABLE_H / 4) * i;
      this.drawDiamond(ctx, -r * 0.52, dy);
      this.drawDiamond(ctx, TABLE_W + r * 0.52, dy);
    }

    // 3. Pockets with Leather Rim & Deep Shadow
    for (const p of POCKETS) {
      // Leather pocket collar
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r + 6, 0, Math.PI * 2);
      ctx.fillStyle = '#1b0d06';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r + 4, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(212, 175, 55, 0.25)';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Deep hole
      const pGrad = ctx.createRadialGradient(p.x, p.y, 4, p.x, p.y, p.r);
      pGrad.addColorStop(0, '#000000');
      pGrad.addColorStop(0.78, '#07090d');
      pGrad.addColorStop(1, '#1e293b');
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = pGrad;
      ctx.fill();
    }

    ctx.restore();
  }

  drawCenterEmblem(ctx) {
    const cx = TABLE_W / 2;
    const cy = TABLE_H / 2;

    ctx.save();
    ctx.translate(cx, cy);

    // Subtle outer emblem rings
    ctx.beginPath();
    ctx.arc(0, 0, 68, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(245, 208, 110, 0.16)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, 61, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Crown / Star accent above text
    ctx.fillStyle = 'rgba(245, 208, 110, 0.24)';
    ctx.font = '700 13px "Be Vietnam Pro", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('★ VIP CLUB ★', 0, -24);

    // Main "Tân Vip" text embossed on the felt
    ctx.font = '800 30px "Be Vietnam Pro", sans-serif';
    ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
    ctx.fillText('Tân Vip', 1.5, 5.5);

    const textGrad = ctx.createLinearGradient(-55, -10, 55, 18);
    textGrad.addColorStop(0, 'rgba(253, 230, 138, 0.34)');
    textGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.38)');
    textGrad.addColorStop(1, 'rgba(245, 158, 11, 0.32)');
    ctx.fillStyle = textGrad;
    ctx.fillText('Tân Vip', 0, 4);

    // Subtitle
    ctx.font = '600 9.5px "JetBrains Mono", monospace';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.fillText('PRO SKILL BILLIARDS', 0, 29);

    ctx.restore();
  }

  drawDiamond(ctx, x, y) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = '#fef3c7';
    ctx.fillRect(-3.4, -3.4, 6.8, 6.8);
    ctx.strokeStyle = 'rgba(180, 130, 40, 0.7)';
    ctx.lineWidth = 0.8;
    ctx.strokeRect(-3.4, -3.4, 6.8, 6.8);
    ctx.restore();
  }

  drawBall(ctx, ball, highlightCue) {
    const x = ball.x + this.railSize;
    const y = ball.y + this.railSize;
    const r = BALL_R;

    ctx.save();

    // Soft ambient + directional drop shadow
    ctx.beginPath();
    ctx.arc(x + 3.5, y + 4.5, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
    ctx.fill();

    // Highlight ring for Ball-in-Hand
    if (highlightCue) {
      ctx.beginPath();
      ctx.arc(x, y, r + 5.5, 0, Math.PI * 2);
      ctx.strokeStyle = '#34d399';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }

    // Ball body clipped to circle
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.clip();

    if (ball.isStripe) {
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
      ctx.arc(x, y, r * 0.49, 0, Math.PI * 2);
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
      x - r * 0.36,
      y - r * 0.36,
      r * 0.08,
      x,
      y,
      r
    );
    shade.addColorStop(0, 'rgba(255, 255, 255, 0.55)');
    shade.addColorStop(0.28, 'rgba(255, 255, 255, 0.08)');
    shade.addColorStop(0.75, 'rgba(0, 0, 0, 0.22)');
    shade.addColorStop(1, 'rgba(0, 0, 0, 0.58)');
    ctx.fillStyle = shade;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);

    // Crisp glossy specular dot
    ctx.beginPath();
    ctx.ellipse(x - r * 0.34, y - r * 0.34, r * 0.22, r * 0.14, -Math.PI / 4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.fill();

    ctx.restore();
  }

  drawCueStick(ctx, cueBall, angle, powerPct) {
    const cx = cueBall.x + this.railSize;
    const cy = cueBall.y + this.railSize;

    const pullback = 18 + powerPct * 95;
    const stickLen = 350;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle + Math.PI);

    // Soft shadow on felt
    ctx.fillStyle = 'rgba(0, 0, 0, 0.38)';
    ctx.beginPath();
    ctx.moveTo(pullback, 3);
    ctx.lineTo(pullback + stickLen, 6);
    ctx.lineTo(pullback + stickLen, 11);
    ctx.lineTo(pullback, 6);
    ctx.closePath();
    ctx.fill();

    // Blue chalk tip
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(pullback, -2.5, 4, 5);

    // Ivory ferrule
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(pullback + 4, -2.6, 9, 5.2);

    // Canadian Maple shaft
    const shaftGrad = ctx.createLinearGradient(pullback + 13, 0, pullback + 185, 0);
    shaftGrad.addColorStop(0, '#f7dfb9');
    shaftGrad.addColorStop(1, '#d19e62');
    ctx.fillStyle = shaftGrad;
    ctx.beginPath();
    ctx.moveTo(pullback + 13, -2.6);
    ctx.lineTo(pullback + 185, -4.4);
    ctx.lineTo(pullback + 185, 4.4);
    ctx.lineTo(pullback + 13, 2.6);
    ctx.closePath();
    ctx.fill();

    // Brass joint collar
    ctx.fillStyle = '#eab308';
    ctx.fillRect(pullback + 183, -4.5, 5, 9);

    // Ebony & Rosewood VIP butt
    const buttGrad = ctx.createLinearGradient(pullback + 188, 0, pullback + stickLen, 0);
    buttGrad.addColorStop(0, '#111827');
    buttGrad.addColorStop(0.45, '#7c2d12');
    buttGrad.addColorStop(0.85, '#1e293b');
    buttGrad.addColorStop(1, '#090d14');
    ctx.fillStyle = buttGrad;
    ctx.beginPath();
    ctx.moveTo(pullback + 188, -4.5);
    ctx.lineTo(pullback + stickLen, -6.6);
    ctx.lineTo(pullback + stickLen, 6.6);
    ctx.lineTo(pullback + 188, 4.5);
    ctx.closePath();
    ctx.fill();

    // Gold inlay ring at butt cap
    ctx.fillStyle = '#facc15';
    ctx.fillRect(pullback + stickLen - 14, -6.2, 3.5, 12.4);

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
