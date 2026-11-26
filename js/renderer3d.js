// 3D Player POV Renderer using Three.js
// STRICTLY NO AIMING GUIDELINE — Pure skill in 3D!

class PoolRenderer3D {
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#070b12');

    this.camera = new THREE.PerspectiveCamera(46, 16 / 9, 5, 3000);
    this.camPos = new THREE.Vector3(0, 650, 420);
    this.camTarget = new THREE.Vector3(0, 0, 0);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camTarget);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;

    this.ballMeshes = new Map();
    this.cueGroup = null;
    this.feltMesh = null;
    this.themeIndex = 0;
    this.raycaster = new THREE.Raycaster();
    this.tablePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -BALL_R);

    this.setupLights();
    this.buildTable();
    this.buildCueStick();
  }

  // Convert logical (0..TABLE_W, 0..TABLE_H) to 3D world (X, Z)
  toWorldX(x) {
    return x - TABLE_W / 2;
  }
  toWorldZ(y) {
    return y - TABLE_H / 2;
  }

  setupLights() {
    const ambient = new THREE.AmbientLight('#cbd5e1', 0.55);
    this.scene.add(ambient);

    const spot1 = new THREE.SpotLight('#fffbeb', 2.4, 1800, Math.PI / 3.1, 0.45, 1.0);
    spot1.position.set(-180, 560, 0);
    spot1.castShadow = true;
    spot1.shadow.bias = -0.0015;
    spot1.shadow.mapSize.width = 1024;
    spot1.shadow.mapSize.height = 1024;
    spot1.target.position.set(-180, 0, 0);
    this.scene.add(spot1, spot1.target);

    const spot2 = new THREE.SpotLight('#fffbeb', 2.4, 1800, Math.PI / 3.1, 0.45, 1.0);
    spot2.position.set(180, 560, 0);
    spot2.castShadow = true;
    spot2.shadow.bias = -0.0015;
    spot2.shadow.mapSize.width = 1024;
    spot2.shadow.mapSize.height = 1024;
    spot2.target.position.set(180, 0, 0);
    this.scene.add(spot2, spot2.target);

    const rim = new THREE.DirectionalLight('#93c5fd', 0.35);
    rim.position.set(0, 300, -500);
    this.scene.add(rim);
  }

  createFeltTexture(theme) {
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 512;
    const ctx = c.getContext('2d');

    const grad = ctx.createRadialGradient(512, 256, 30, 512, 256, 560);
    grad.addColorStop(0, theme.main);
    grad.addColorStop(0.6, theme.mid);
    grad.addColorStop(1, theme.edge);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1024, 512);

    // Head string line
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(256, 0);
    ctx.lineTo(256, 512);
    ctx.stroke();

    // Break & foot spots
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    for (const sx of [256, 758]) {
      ctx.beginPath();
      ctx.arc(sx, 256, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Center Emblem "Tân Vip"
    ctx.save();
    ctx.translate(512, 256);
    ctx.beginPath();
    ctx.arc(0, 0, 74, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(245, 208, 110, 0.22)';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, 66, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(245, 208, 110, 0.34)';
    ctx.font = '700 14px "Be Vietnam Pro", sans-serif';
    ctx.fillText('★ VIP CLUB ★', 0, -28);

    ctx.font = '800 34px "Be Vietnam Pro", sans-serif';
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillText('Tân Vip', 2, 6);
    ctx.fillStyle = 'rgba(253, 230, 138, 0.48)';
    ctx.fillText('Tân Vip', 0, 4);

    ctx.font = '600 10px "JetBrains Mono", monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillText('PRO SKILL BILLIARDS', 0, 32);
    ctx.restore();

    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 8;
    return tex;
  }

  createWoodTexture() {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 128;
    const ctx = c.getContext('2d');

    const grad = ctx.createLinearGradient(0, 0, 512, 0);
    grad.addColorStop(0, '#5a2811');
    grad.addColorStop(0.5, '#6e3216');
    grad.addColorStop(1, '#4a1f0c');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 128);

    // Subtle mahogany wood grain streaks
    for (let i = 0; i < 45; i++) {
      ctx.strokeStyle = i % 2 === 0 ? 'rgba(30, 10, 2, 0.18)' : 'rgba(180, 105, 55, 0.12)';
      ctx.lineWidth = 1 + (i % 3);
      ctx.beginPath();
      const y = (i / 45) * 128;
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(170, y + ((i % 5) - 2) * 4, 340, y - ((i % 4) - 1.5) * 4, 512, y);
      ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  createBeveledBlock(w, h, d, bevel = 3.5) {
    const bw = Math.max(2, w - bevel * 2);
    const bd = Math.max(2, d - bevel * 2);
    const shape = new THREE.Shape();
    shape.moveTo(-bw / 2, -bd / 2);
    shape.lineTo(bw / 2, -bd / 2);
    shape.lineTo(bw / 2, bd / 2);
    shape.lineTo(-bw / 2, bd / 2);
    shape.closePath();

    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: Math.max(2, h - bevel * 2),
      bevelEnabled: true,
      bevelSegments: 4,
      steps: 1,
      bevelSize: bevel,
      bevelThickness: bevel,
    });
    geo.center();
    geo.rotateX(Math.PI / 2);
    return geo;
  }

  buildTable() {
    const theme = FELT_THEMES[this.themeIndex];
    const feltGeo = new THREE.PlaneGeometry(TABLE_W + 6, TABLE_H + 6);
    const feltMat = new THREE.MeshStandardMaterial({
      map: this.createFeltTexture(theme),
      roughness: 0.86,
      metalness: 0.02,
    });
    this.feltMesh = new THREE.Mesh(feltGeo, feltMat);
    this.feltMesh.rotation.x = -Math.PI / 2;
    this.feltMesh.position.y = 0;
    this.feltMesh.receiveShadow = true;
    this.scene.add(this.feltMesh);

    // Table skirt / apron underneath with subtle gold trim
    const bodyGeo = this.createBeveledBlock(TABLE_W + 116, 46, TABLE_H + 116, 6);
    const bodyMat = new THREE.MeshStandardMaterial({ color: '#241006', roughness: 0.45, metalness: 0.12 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = -24;
    this.scene.add(body);

    const trimSkirt = new THREE.Mesh(
      new THREE.BoxGeometry(TABLE_W + 120, 3, TABLE_H + 120),
      new THREE.MeshStandardMaterial({ color: '#c59b47', roughness: 0.3, metalness: 0.8 })
    );
    trimSkirt.position.y = -4;
    this.scene.add(trimSkirt);

    // Rounded / Beveled Mahogany Wood Rails & Cushions
    const railMat = new THREE.MeshStandardMaterial({
      map: this.createWoodTexture(),
      roughness: 0.24,
      metalness: 0.08,
    });
    const cushionMat = new THREE.MeshStandardMaterial({ color: theme.cushion, roughness: 0.76 });

    const railH = 24;
    const cushionThick = 12;
    const railThick = 48;

    // Top & Bottom: 2 rounded rail segments + 2 beveled cushion segments per side
    const topSegLen = TABLE_W / 2 - 58;
    const topRailGeo = this.createBeveledBlock(topSegLen, railH, railThick, 4);
    const topCushionGeo = this.createBeveledBlock(topSegLen, 18, cushionThick, 2.2);

    for (const signZ of [-1, 1]) {
      for (const sideX of [-1, 1]) {
        const cx = sideX * (TABLE_W / 4 + 2);
        const rMesh = new THREE.Mesh(topRailGeo, railMat);
        rMesh.position.set(cx, railH / 2, signZ * (TABLE_H / 2 + cushionThick + railThick / 2));
        rMesh.castShadow = true;
        rMesh.receiveShadow = true;
        this.scene.add(rMesh);

        const cMesh = new THREE.Mesh(topCushionGeo, cushionMat);
        cMesh.position.set(cx, 9.5, signZ * (TABLE_H / 2 + cushionThick / 2));
        this.scene.add(cMesh);
      }
    }

    // Left & Right rounded rails + beveled cushions
    const sideSegLen = TABLE_H - 72;
    const sideRailGeo = this.createBeveledBlock(railThick, railH, sideSegLen, 4);
    const sideCushionGeo = this.createBeveledBlock(cushionThick, 18, sideSegLen, 2.2);

    for (const signX of [-1, 1]) {
      const rMesh = new THREE.Mesh(sideRailGeo, railMat);
      rMesh.position.set(signX * (TABLE_W / 2 + cushionThick + railThick / 2), railH / 2, 0);
      rMesh.castShadow = true;
      rMesh.receiveShadow = true;
      this.scene.add(rMesh);

      const cMesh = new THREE.Mesh(sideCushionGeo, cushionMat);
      cMesh.position.set(signX * (TABLE_W / 2 + cushionThick / 2), 9.5, 0);
      this.scene.add(cMesh);
    }

    // Corner Pocket Hoods (smooth rounded brass + leather castings)
    const brassMat = new THREE.MeshStandardMaterial({ color: '#d4af37', roughness: 0.25, metalness: 0.85 });
    const leatherMat = new THREE.MeshStandardMaterial({ color: '#1b0f09', roughness: 0.6, metalness: 0.1 });
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const px = sx * (TABLE_W / 2 - 4);
        const pz = sz * (TABLE_H / 2 - 4);
        const hood = new THREE.Mesh(new THREE.CylinderGeometry(35, 36, railH - 1, 28), brassMat);
        hood.position.set(px + sx * 28, railH / 2, pz + sz * 28);
        const capTop = new THREE.Mesh(new THREE.CylinderGeometry(31, 35, 3, 28), leatherMat);
        capTop.position.set(px + sx * 28, railH + 0.5, pz + sz * 28);
        this.scene.add(hood, capTop);
      }
    }

    // Side Pocket Rounded Leather Bridges
    const sideBridgeGeo = this.createBeveledBlock(62, railH, 28, 4);
    for (const sz of [-1, 1]) {
      const bridge = new THREE.Mesh(sideBridgeGeo, leatherMat);
      bridge.position.set(0, railH / 2, sz * (TABLE_H / 2 + cushionThick + railThick - 12));
      this.scene.add(bridge);
    }

    // Diamond Sights
    const diamondMat = new THREE.MeshStandardMaterial({ color: '#fef3c7', roughness: 0.2, metalness: 0.3 });
    const dGeo = new THREE.BoxGeometry(6, 1.5, 6);
    for (let i = 1; i <= 7; i++) {
      if (i === 4) continue;
      const wx = (TABLE_W / 8) * i - TABLE_W / 2;
      for (const sz of [-1, 1]) {
        const d = new THREE.Mesh(dGeo, diamondMat);
        d.position.set(wx, railH - 0.3, sz * (TABLE_H / 2 + cushionThick + railThick / 2));
        d.rotation.y = Math.PI / 4;
        this.scene.add(d);
      }
    }
    for (let i = 1; i <= 3; i++) {
      const wz = (TABLE_H / 4) * i - TABLE_H / 2;
      for (const sx of [-1, 1]) {
        const d = new THREE.Mesh(dGeo, diamondMat);
        d.position.set(sx * (TABLE_W / 2 + cushionThick + railThick / 2), railH - 0.3, wz);
        d.rotation.y = Math.PI / 4;
        this.scene.add(d);
      }
    }

    // 6 Pro Drop-Pockets with radial depth texture & leather/brass collars
    const pCanvas = document.createElement('canvas');
    pCanvas.width = 128;
    pCanvas.height = 128;
    const pCtx = pCanvas.getContext('2d');
    const pGrad = pCtx.createRadialGradient(64, 64, 10, 64, 64, 62);
    pGrad.addColorStop(0, '#000000');
    pGrad.addColorStop(0.68, '#05070a');
    pGrad.addColorStop(0.86, '#1f1109');
    pGrad.addColorStop(0.95, '#3b2010');
    pGrad.addColorStop(1, '#140a04');
    pCtx.fillStyle = pGrad;
    pCtx.beginPath();
    pCtx.arc(64, 64, 62, 0, Math.PI * 2);
    pCtx.fill();
    const pocketTex = new THREE.CanvasTexture(pCanvas);

    const pocketMat = new THREE.MeshBasicMaterial({ map: pocketTex, transparent: true });
    const collarMat = new THREE.MeshStandardMaterial({ color: '#1f120b', roughness: 0.65, metalness: 0.1 });
    const ringMat = new THREE.MeshStandardMaterial({ color: '#c59b47', roughness: 0.3, metalness: 0.8 });

    for (const p of POCKETS) {
      const wx = this.toWorldX(p.x);
      const wz = this.toWorldZ(p.y);

      // Deep gradient pocket opening
      const hole = new THREE.Mesh(new THREE.CylinderGeometry(p.r + 2, p.r + 2, 0.6, 32), pocketMat);
      hole.position.set(wx, 0.45, wz);
      this.scene.add(hole);

      // Leather & brass pocket surround ring
      const collar = new THREE.Mesh(
        new THREE.TorusGeometry(p.r + 2.5, 3.2, 10, 32),
        collarMat
      );
      collar.rotation.x = Math.PI / 2;
      collar.position.set(wx, 1.8, wz);
      this.scene.add(collar);

      if (p.type === 'side') {
        const trim = new THREE.Mesh(
          new THREE.TorusGeometry(p.r + 5.2, 1.0, 8, 28, Math.PI),
          ringMat
        );
        trim.rotation.x = Math.PI / 2;
        trim.rotation.z = p.y < TABLE_H / 2 ? Math.PI : 0;
        trim.position.set(wx, 2.2, wz);
        this.scene.add(trim);
      } else {
        // Corner pocket brass outer arc
        const angleToCenter = Math.atan2(-wz, -wx);
        const trim = new THREE.Mesh(
          new THREE.TorusGeometry(p.r + 5.0, 1.1, 8, 28, Math.PI * 1.1),
          ringMat
        );
        trim.rotation.x = Math.PI / 2;
        trim.rotation.z = angleToCenter + Math.PI * 0.45;
        trim.position.set(wx, 2.2, wz);
        this.scene.add(trim);
      }
    }
  }

  cycleTheme() {
    this.themeIndex = (this.themeIndex + 1) % FELT_THEMES.length;
    const theme = FELT_THEMES[this.themeIndex];
    if (this.feltMesh) {
      this.feltMesh.material.map.dispose();
      this.feltMesh.material.map = this.createFeltTexture(theme);
      this.feltMesh.material.needsUpdate = true;
    }
    return theme;
  }

  createBallTexture(ball) {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 128;
    const ctx = c.getContext('2d');

    if (ball.id === 0) {
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, 256, 128);
      // Tiny red pro-cup dot so spin is visible!
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(128, 64, 7, 0, Math.PI * 2);
      ctx.fill();
    } else if (ball.isStripe) {
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, 256, 128);
      ctx.fillStyle = ball.color;
      ctx.fillRect(0, 32, 256, 64);
    } else {
      ctx.fillStyle = ball.color;
      ctx.fillRect(0, 0, 256, 128);
    }

    if (ball.id > 0) {
      for (const cx of [64, 192]) {
        ctx.beginPath();
        ctx.arc(cx, 64, 19, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.fillStyle = '#0f172a';
        ctx.font = '800 20px "Be Vietnam Pro", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(ball.id), cx, 65);
      }
    }

    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 4;
    return tex;
  }

  ensureBallMesh(ball) {
    let mesh = this.ballMeshes.get(ball.id);
    if (!mesh) {
      const geo = new THREE.SphereGeometry(BALL_R, 28, 20);
      const mat = new THREE.MeshStandardMaterial({
        map: this.createBallTexture(ball),
        roughness: 0.16,
        metalness: 0.05,
      });
      mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      this.ballMeshes.set(ball.id, mesh);
    }
    return mesh;
  }

  buildCueStick() {
    this.cueGroup = new THREE.Group();

    const tip = new THREE.Mesh(
      new THREE.CylinderGeometry(2.5, 2.6, 5, 12),
      new THREE.MeshStandardMaterial({ color: '#38bdf8', roughness: 0.8 })
    );
    tip.rotation.z = Math.PI / 2;
    tip.position.x = 2.5;

    const ferrule = new THREE.Mesh(
      new THREE.CylinderGeometry(2.6, 2.8, 10, 12),
      new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.3 })
    );
    ferrule.rotation.z = Math.PI / 2;
    ferrule.position.x = 10;

    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(2.8, 4.5, 175, 14),
      new THREE.MeshStandardMaterial({ color: '#e6c28a', roughness: 0.35 })
    );
    shaft.rotation.z = Math.PI / 2;
    shaft.position.x = 102;

    const butt = new THREE.Mesh(
      new THREE.CylinderGeometry(4.5, 6.4, 175, 14),
      new THREE.MeshStandardMaterial({ color: '#3b180b', roughness: 0.25, metalness: 0.1 })
    );
    butt.rotation.z = Math.PI / 2;
    butt.position.x = 277;

    this.cueGroup.add(tip, ferrule, shaft, butt);
    this.cueGroup.castShadow = true;
    this.scene.add(this.cueGroup);
  }

  resize(containerWidth, containerHeight) {
    const w = Math.max(320, Math.floor(containerWidth));
    const h = Math.max(200, Math.floor(containerHeight));
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
  }

  clientToTable(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(this.tablePlane, hit)) {
      return { x: hit.x + TABLE_W / 2, y: hit.z + TABLE_H / 2 };
    }
    return { x: TABLE_W / 2, y: TABLE_H / 2 };
  }

  render(physics, aimState) {
    // 1. Update Ball Meshes
    for (const ball of physics.balls) {
      const mesh = this.ensureBallMesh(ball);
      mesh.visible = !ball.pocketed;
      if (!ball.pocketed) {
        mesh.position.set(this.toWorldX(ball.x), BALL_R, this.toWorldZ(ball.y));
        const spd = Math.hypot(ball.vx, ball.vy);
        if (spd > 0.01) {
          // Roll sphere realistically along velocity axis
          const axis = new THREE.Vector3(ball.vy, 0, -ball.vx).normalize();
          mesh.rotateOnWorldAxis(axis, (spd / BALL_R) * 0.85);
        }
      }
    }

    // 2. Update Cue Stick
    const cue = physics.getCueBall();
    const showCue = aimState.showCue && cue && !cue.pocketed;
    this.cueGroup.visible = !!showCue;
    if (showCue) {
      const pullback = 20 + aimState.power * 105;
      const dx = Math.cos(aimState.angle);
      const dz = Math.sin(aimState.angle);
      this.cueGroup.position.set(
        this.toWorldX(cue.x) - dx * pullback,
        BALL_R + 7,
        this.toWorldZ(cue.y) - dz * pullback
      );
      this.cueGroup.rotation.set(0, -aimState.angle + Math.PI, -0.07);
    }

    // 3. Smooth Camera: Player POV when aiming, Overhead Broadcast when rolling/placing/peeking
    const desiredPos = new THREE.Vector3();
    const desiredTarget = new THREE.Vector3();

    if (showCue && !aimState.ballInHand && !aimState.peekTop) {
      const dirX = Math.cos(aimState.angle);
      const dirZ = Math.sin(aimState.angle);
      const cx = this.toWorldX(cue.x);
      const cz = this.toWorldZ(cue.y);

      desiredPos.set(cx - dirX * 225, 138, cz - dirZ * 225);
      desiredTarget.set(cx + dirX * 230, 12, cz + dirZ * 230);
    } else {
      // Angled overhead broadcast view showing full table cleanly
      desiredPos.set(0, 770, 480);
      desiredTarget.set(0, 0, 10);
    }

    const lerpRate = aimState.peekTop ? 0.16 : 0.11;
    this.camPos.lerp(desiredPos, lerpRate);
    this.camTarget.lerp(desiredTarget, lerpRate);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camTarget);

    this.renderer.render(this.scene, this.camera);
  }
}
