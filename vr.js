// VR room: white grid space, portfolio cards as climbable 3D slabs, Gorilla locomotion.
import * as THREE from 'three';
import { World, GorillaPlayer } from './gorilla.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// World-space grid shader: gives depth cues on every surface.
const gridMat = (base = 0xf2f2ef) => new THREE.ShaderMaterial({
  uniforms: { base: { value: new THREE.Color(base) }, fogCol: { value: new THREE.Color(0xf7f7f5) } },
  vertexShader: `varying vec3 vW; varying vec3 vN;
    void main(){ vec4 w = modelMatrix*vec4(position,1.); vW=w.xyz; vN=normalize(mat3(modelMatrix)*normal); gl_Position=projectionMatrix*viewMatrix*w; }`,
  fragmentShader: `uniform vec3 base; uniform vec3 fogCol; varying vec3 vW; varying vec3 vN;
    float grid(vec2 p){ vec2 g=abs(fract(p-.5)-.5)/fwidth(p); return 1.-min(min(g.x,g.y),1.); }
    void main(){ vec3 n=abs(vN); vec2 uv = n.y>.5 ? vW.xz : (n.x>.5 ? vW.zy : vW.xy);
      float major=grid(uv*2.), minor=grid(uv*10.);
      float shade=.78+.22*max(dot(vN,normalize(vec3(.4,1.,.3))),0.);
      vec3 c=base*shade; c=mix(c,vec3(.55),minor*.18); c=mix(c,vec3(.2),major*.5);
      float f=smoothstep(8.,30.,distance(vW,cameraPosition)); gl_FragColor=vec4(mix(c,fogCol,f),1.); }`
});

function cardTexture(card, w = 1024, h = 1024) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#ff5a1f'; g.fillRect(0, 0, w, 14);
  let y = 90; const x = 60, maxW = w - 120;
  const wrap = (text, font, lh, color, maxLines = 99) => {
    g.font = font; g.fillStyle = color; let line = '', n = 0;
    for (const word of String(text).split(' ')) {
      const t = line ? line + ' ' + word : word;
      if (g.measureText(t).width > maxW && line) { g.fillText(line, x, y); y += lh; line = word; if (++n >= maxLines) return; }
      else line = t;
    }
    if (line) { g.fillText(line, x, y); y += lh; }
  };
  wrap(card.tag.toUpperCase(), '700 30px system-ui,sans-serif', 44, '#ff5a1f');
  y += 20; wrap(card.title, '800 76px system-ui,sans-serif', 84, '#151515', 2);
  y += 10; wrap(card.summary, '400 36px system-ui,sans-serif', 48, '#333', 5);
  y += 20;
  for (const p of card.points.slice(0, 4)) { if (y > h - 90) break; wrap('• ' + p.split(/[.:]/)[0], '400 30px system-ui,sans-serif', 40, '#555', 2); y += 8; }
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return tex;
}

export async function enterVR(data) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight);
  renderer.xr.enabled = true; renderer.xr.setFoveation(1);
  document.body.appendChild(renderer.domElement);
  renderer.domElement.style.cssText = 'position:fixed;inset:0;z-index:10';

  const scene = new THREE.Scene(); scene.background = new THREE.Color(0xf7f7f5);
  const rig = new THREE.Group(); scene.add(rig);
  const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.03, 100); rig.add(camera);
  const world = new World();

  // --- geometry: every box is also a collider ---
  const box = (min, max, color, slip) => {
    const s = max.clone().sub(min), m = new THREE.Mesh(new THREE.BoxGeometry(s.x, s.y, s.z), gridMat(color));
    m.position.copy(min).add(max).multiplyScalar(0.5); scene.add(m); world.add(min, max, slip); return m;
  };
  box(V(-25, -1, -25), V(25, 0, 25));                       // floor
  // climbing steps + platform behind spawn
  box(V(-1, 0, 3), V(1, 0.4, 4)); box(V(-1, 0, 4), V(1, 0.9, 5)); box(V(-1, 0, 5), V(1, 1.5, 7), 0xe9e9e4);
  // pillars to swing around
  [[-3, 3], [3, 3], [-6, -1], [6, -1]].forEach(([x, z]) => box(V(x - 0.25, 0, z - 0.25), V(x + 0.25, 2.8, z + 0.25), 0xe4e4df));
  // low table for grabbables
  box(V(-3.6, 0, -0.4), V(-2.4, 0.5, 0.4), 0xe4e4df);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x999999, 1.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.2); sun.position.set(3, 6, 2); scene.add(sun);

  // --- grabbables: not locomotion colliders; simple sphere physics against the world boxes ---
  const grabbables = [];
  const addGrab = (geo, color, r, p) => {
    const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color })); m.position.copy(p); scene.add(m);
    grabbables.push({ m, r, vel: V(), held: -1, baseColor: new THREE.Color(color), hist: [] });
  };
  addGrab(new THREE.BoxGeometry(0.16, 0.16, 0.16), 0xff5a1f, 0.08, V(-3.3, 0.6, 0));
  addGrab(new THREE.SphereGeometry(0.09, 20, 14), 0x2a6df4, 0.09, V(-3.0, 0.6, 0.15));
  addGrab(new THREE.BoxGeometry(0.22, 0.22, 0.22), 0x222222, 0.11, V(-2.7, 0.6, -0.1));
  addGrab(new THREE.SphereGeometry(0.12, 20, 14), 0xffc629, 0.12, V(0.6, 0.2, 1.5));
  addGrab(new THREE.BoxGeometry(0.3, 0.3, 0.3), 0x16a36a, 0.15, V(0, 1.7, 6));

  // --- cards: slabs arranged in a U, facing the centre ---
  const cards = data.cards, W = 1.7, H = 1.7, T = 0.2, base = 0.35;
  const slots = [];
  const front = Math.ceil(cards.length / 2), side = cards.length - front;
  for (let i = 0; i < front; i++) slots.push({ x: (i - (front - 1) / 2) * (W + 0.6), z: -4, face: 'z' });
  for (let i = 0; i < side; i++) { const s = i % 2 ? 1 : -1, k = Math.floor(i / 2); slots.push({ x: s * 5, z: -1.5 + k * 2.4 - 1.2, face: s > 0 ? '-x' : 'x' }); }
  cards.forEach((c, i) => {
    const s = slots[i]; const alongX = s.face === 'z';
    const hw = alongX ? W / 2 : T / 2, hd = alongX ? T / 2 : W / 2;
    box(V(s.x - hw, 0, s.z - hd), V(s.x + hw, base + H + 0.1, s.z + hd), 0xe6e6e1);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.1, H - 0.1), new THREE.MeshBasicMaterial({ map: cardTexture(c) }));
    face.position.set(s.x, base + H / 2 + 0.05, s.z);
    if (s.face === 'z') face.position.z += T / 2 + 0.005;
    if (s.face === 'x') { face.position.x += T / 2 + 0.005; face.rotation.y = Math.PI / 2; }
    if (s.face === '-x') { face.position.x -= T / 2 + 0.005; face.rotation.y = -Math.PI / 2; }
    scene.add(face);
  });
  // name banner
  const banner = cardTexture({ tag: data.role, title: data.name, summary: data.highlight, points: [] }, 2048, 700);
  const bm = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 1.5), new THREE.MeshBasicMaterial({ map: banner }));
  bm.position.set(0, 3.3, -4.2); scene.add(bm);

  // --- hands ---
  const handMesh = [0, 1].map(() => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 12), new THREE.MeshBasicMaterial({ color: 0x222222 })); scene.add(m); return m; });
  const grips = {}, pads = {};
  [0, 1].forEach(i => {
    const g = renderer.xr.getControllerGrip(i); rig.add(g);
    g.addEventListener('connected', e => { const h = e.data.handedness === 'left' ? 0 : 1; grips[h] = g; pads[h] = e.data.gamepad; });
    g.addEventListener('disconnected', () => { for (const k in grips) if (grips[k] === g) { delete grips[k]; delete pads[k]; } });
  });

  // --- audio ---
  const ac = new (window.AudioContext || window.webkitAudioContext)();
  // short "thump": low-passed noise burst + low sine, volume from impact speed, slight random pitch
  const noise = ac.createBuffer(1, ac.sampleRate * 0.1, ac.sampleRate); const nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ac.sampleRate * 0.012));
  const tap = (vol = 1) => {
    const t0 = ac.currentTime, pitch = 0.92 + Math.random() * 0.16;
    const s = ac.createBufferSource(); s.buffer = noise; s.playbackRate.value = pitch;
    const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900 + 1500 * vol;
    const g = ac.createGain(); g.gain.value = 0.5 * vol; s.connect(f).connect(g).connect(ac.destination); s.start(t0);
    const o = ac.createOscillator(), og = ac.createGain(); o.frequency.value = 110 * pitch;
    og.gain.setValueAtTime(0.35 * vol, t0); og.gain.exponentialRampToValueAtTime(0.001, t0 + 0.09);
    o.connect(og).connect(ac.destination); o.start(t0); o.stop(t0 + 0.1);
  };

  // --- input adapter for the locomotion port ---
  let headLocal = V(0, 1.6, 0);
  const fallback = [V(-0.2, 0.9, -0.2), V(0.2, 0.9, -0.2)];
  const input = {
    head: () => headLocal,
    hand: i => (grips[i] && grips[i].visible ? grips[i].position : headLocal.clone().add(fallback[i]).setY(headLocal.y - 0.7)),
    handQuat: i => (grips[i] ? grips[i].quaternion : new THREE.Quaternion()),
    haptic: (i, amp, sec) => pads[i]?.hapticActuators?.[0]?.pulse?.(amp, sec * 1000),
    tapSound: (i, vol) => tap(vol)
  };
  const player = new GorillaPlayer(rig, world, input);

  // --- grabbing: grip button, nearest object within reach of the hand ---
  const GRAB_REACH = 0.1, gripWas = [false, false], held = [null, null];
  const handQuatWorld = i => rig.quaternion.clone().multiply(input.handQuat(i));
  const gp = { p: V(), c: V() };
  function updateGrab(dt) {
    for (let i = 0; i < 2; i++) {
      const hp = player.followers[i], down = !!pads[i]?.buttons?.[1]?.pressed;
      let near = null, nd = Infinity;
      if (!held[i]) for (const g of grabbables) {
        if (g.held >= 0) continue;
        const d = g.m.position.distanceTo(hp) - g.r;
        if (d < GRAB_REACH && d < nd) { nd = d; near = g; }
      }
      if (down && !gripWas[i] && near) {
        const iq = handQuatWorld(i).invert();
        near.offP = near.m.position.clone().sub(hp).applyQuaternion(iq);
        near.offQ = iq.multiply(near.m.quaternion);
        near.held = i; near.hist = []; held[i] = near;
        input.haptic(i, 0.3, 0.04);
      }
      if (!down && gripWas[i] && held[i]) {            // release + throw with averaged hand velocity
        const g = held[i], h = g.hist;
        g.vel.set(0, 0, 0); if (h.length > 1) g.vel.copy(h[h.length - 1].p).sub(h[0].p).divideScalar(Math.max(h[h.length - 1].t - h[0].t, 1e-3));
        g.held = -1; held[i] = null;
      }
      gripWas[i] = down;
      grabbables.forEach(g => { if (g.held < 0 && g !== near) g.m.material.color.copy(g.baseColor); });
      if (near && !held[i]) near.m.material.color.copy(near.baseColor).lerp(new THREE.Color(0xffffff), 0.45);
    }
    const now = performance.now() / 1000;
    for (const g of grabbables) {
      if (g.held >= 0) {
        const q = handQuatWorld(g.held);
        g.m.position.copy(player.followers[g.held]).add(g.offP.clone().applyQuaternion(q));
        g.m.quaternion.copy(q.multiply(g.offQ));
        g.hist.push({ p: g.m.position.clone(), t: now }); if (g.hist.length > 6) g.hist.shift();
        continue;
      }
      g.vel.y -= 9.81 * dt; g.m.position.addScaledVector(g.vel, dt);
      let ground = false;
      for (const b of world.cols) {
        gp.c.copy(g.m.position); gp.p.copy(gp.c).clamp(b.min, b.max);
        const n = gp.c.clone().sub(gp.p), d = n.length();
        if (d >= g.r || d < 1e-6) continue;
        n.divideScalar(d); g.m.position.addScaledVector(n, g.r - d);
        const vn = g.vel.dot(n); if (vn < 0) g.vel.addScaledVector(n, -1.35 * vn);   // restitution 0.35
        if (n.y > 0.7) ground = true;
      }
      if (ground) { g.vel.x *= 0.9; g.vel.z *= 0.9; if (g.vel.lengthSq() < 0.01) g.vel.set(0, 0, 0); }
      if (g.m.position.y < -10) { g.m.position.set(0, 1, 0); g.vel.set(0, 0, 0); }
    }
  }

  let snapReady = true, lastT;
  renderer.setAnimationLoop((t, frame) => {
    const pose = frame && frame.getViewerPose(renderer.xr.getReferenceSpace());
    if (pose) headLocal.copy(pose.transform.position);
    const ax = pads[1]?.axes?.[2] ?? 0;               // snap turn, right stick
    if (Math.abs(ax) > 0.7 && snapReady) { player.turn(ax > 0 ? -45 : 45); snapReady = false; }
    if (Math.abs(ax) < 0.3) snapReady = true;
    player.update();
    const now = performance.now() / 1000, gdt = Math.min(now - (lastT ?? now), 0.05); lastT = now;
    updateGrab(gdt);
    if (rig.position.y < -20) { rig.position.set(0, 0, 0); player.vel.set(0, 0, 0); player.initializeValues(); }
    handMesh[0].position.copy(player.followers[0]); handMesh[1].position.copy(player.followers[1]);
    renderer.render(scene, camera);
  });

  const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor'] });
  ac.resume();
  session.addEventListener('end', () => { renderer.setAnimationLoop(null); renderer.domElement.remove(); renderer.dispose(); ac.close(); });
  await renderer.xr.setSession(session);
  player.initializeValues();
}
