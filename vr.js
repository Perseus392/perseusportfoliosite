// VR mode: loads Rapier + rooms/<name>.glb, places portfolio cards, runs Gorilla locomotion + grabbing.
import * as THREE from 'three';
import { GorillaPlayer } from './gorilla.js';
import { createPhysics } from './physics.js';
import { loadRoom } from './room.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const FLIP = new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), Math.PI);   // GrabPoint +Z -> controller grip -Z
const GRAB_REACH = 0.06, CARD_SIZE = 1.6;

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

// Loads everything up front so the Enter VR click can start the session immediately. Returns { start }.
export async function prepareVR(data) {
  const roomName = new URLSearchParams(location.search).get('room') || 'room';
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight);
  renderer.xr.enabled = true; renderer.xr.setFoveation(0);   // foveation made fine grid lines show a rectangular seam
  renderer.domElement.style.cssText = 'position:fixed;inset:0;z-index:10;display:none';
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene(); scene.background = new THREE.Color(0xf7f7f5);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x999999, 1.4));
  const sun = new THREE.DirectionalLight(0xffffff, 1.3); sun.position.set(3, 6, 2); scene.add(sun);
  const rig = new THREE.Group(); scene.add(rig);
  const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.03, 200); rig.add(camera);

  const phys = await createPhysics();
  const room = await loadRoom(`rooms/${roomName}.glb?v=${window.BUILD || ''}`, scene, phys);

  // cards on Card_N markers (readable side faces the marker's +Z)
  room.cards.forEach((marker, i) => {
    const c = data.cards[i]; if (!marker || !c) return;
    const s = marker.getWorldScale(V());
    const face = new THREE.Mesh(new THREE.PlaneGeometry(CARD_SIZE * s.x, CARD_SIZE * s.y), new THREE.MeshBasicMaterial({ map: cardTexture(c) }));
    marker.getWorldPosition(face.position); marker.getWorldQuaternion(face.quaternion); scene.add(face);
  });
  if (room.banner) {
    const s = room.banner.getWorldScale(V());
    const tex = cardTexture({ tag: data.role + (window.BUILD ? '   ·   build ' + window.BUILD : ''), title: data.name, summary: data.highlight, points: [] }, 2048, 700);
    const bm = new THREE.Mesh(new THREE.PlaneGeometry(4.4 * s.x, 1.5 * s.y), new THREE.MeshBasicMaterial({ map: tex }));
    room.banner.getWorldPosition(bm.position); room.banner.getWorldQuaternion(bm.quaternion); scene.add(bm);
  }
  // spawn: player looks along Spawn's +Z
  const spawnPos = V(); let spawnYaw = 0;
  if (room.spawn) {
    room.spawn.getWorldPosition(spawnPos);
    const f = V(0, 0, 1).applyQuaternion(room.spawn.getWorldQuaternion(new THREE.Quaternion()));
    spawnYaw = Math.atan2(-f.x, -f.z);
  }
  const resetRig = () => { rig.position.copy(spawnPos); rig.rotation.set(0, spawnYaw, 0); };
  resetRig();

  // hands + controllers
  const handMesh = [0, 1].map(() => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 12), new THREE.MeshBasicMaterial({ color: 0x222222 })); scene.add(m); return m; });
  const grips = {}, pads = {};
  [0, 1].forEach(i => {
    const g = renderer.xr.getControllerGrip(i); rig.add(g);
    g.addEventListener('connected', e => { const h = e.data.handedness === 'left' ? 0 : 1; grips[h] = g; pads[h] = e.data.gamepad; });
    g.addEventListener('disconnected', () => { for (const k in grips) if (grips[k] === g) { delete grips[k]; delete pads[k]; } });
  });

  // audio (context is created on the Enter VR click)
  let ac = null, noise = null;
  const tap = (vol = 1) => {
    if (!ac) return;
    const t0 = ac.currentTime, pitch = 0.92 + Math.random() * 0.16;
    const s = ac.createBufferSource(); s.buffer = noise; s.playbackRate.value = pitch;
    const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900 + 1500 * vol;
    const g = ac.createGain(); g.gain.value = 0.5 * vol; s.connect(f).connect(g).connect(ac.destination); s.start(t0);
    const o = ac.createOscillator(), og = ac.createGain(); o.frequency.value = 110 * pitch;
    og.gain.setValueAtTime(0.35 * vol, t0); og.gain.exponentialRampToValueAtTime(0.001, t0 + 0.09);
    o.connect(og).connect(ac.destination); o.start(t0); o.stop(t0 + 0.1);
  };

  // locomotion
  const headLocal = V(0, 1.6, 0), fallback = [V(-0.2, 0, -0.2), V(0.2, 0, -0.2)];
  const haptic = (i, amp, sec) => pads[i]?.hapticActuators?.[0]?.pulse?.(amp, sec * 1000);
  const input = {
    head: () => headLocal,
    hand: i => (grips[i] && grips[i].visible ? grips[i].position : headLocal.clone().add(fallback[i]).setY(headLocal.y - 0.7)),
    handQuat: i => (grips[i] ? grips[i].quaternion : new THREE.Quaternion()),
    haptic, tapSound: (i, vol) => tap(vol)
  };
  const player = new GorillaPlayer(rig, phys, input);
  const handQuatWorld = i => rig.quaternion.clone().multiply(input.handQuat(i));

  // grabbables + interactables
  let registry = {};
  try { registry = (await import('../interactables/index.js')).default; } catch (e) { console.warn('no interactables', e); }
  const api = { THREE, scene, player, haptic, sound: tap };
  for (const g of room.grabbables) {
    g.start = { p: g.node.position.clone(), q: g.node.quaternion.clone() };
    g.localBox = new THREE.Box3().setFromObject(g.node)
      .applyMatrix4(new THREE.Matrix4().compose(g.node.position, g.node.quaternion, V(1, 1, 1)).invert());
    g.mats = [];
    g.node.traverse(m => { if (m.isMesh && m.material && m.material.emissive) { m.material = m.material.clone(); g.mats.push(m.material); } });
    if (registry[g.type]) {
      try { const Cls = (await registry[g.type]()).default; g.behaviour = new Cls(g.node, api); }
      catch (e) { console.warn('interactable failed', g.type, e); }
    }
  }
  const call = (g, fn, ...a) => { try { g.behaviour?.[fn]?.(...a); } catch (e) { console.warn(e); } };

  const held = [null, null], btnWas = [[], []];
  function grabTarget(g, i) {
    const hp = player.followers[i], gq = handQuatWorld(i);
    const gp = g.grabPoints[i === 0 ? 'L' : 'R'] || g.grabPoints.ANY;
    if (gp) {   // snap: GrabPoint lines up with the controller grip
      const q = gq.clone().multiply(FLIP).multiply(gp.q.clone().invert());
      return { p: hp.clone().sub(gp.p.clone().applyQuaternion(q)), q };
    }
    return { p: hp.clone().add(g.offP.clone().applyQuaternion(gq)), q: gq.clone().multiply(g.offQ) };   // free grab: keep offset
  }
  function updateHands(now) {
    for (const g of room.grabbables) g.hover = false;
    for (let i = 0; i < 2; i++) {
      const b = pads[i]?.buttons || [], pressed = k => !!b[k]?.pressed, was = k => !!btnWas[i][k];
      const hp = player.followers[i];
      let near = null, nd = Infinity;
      if (!held[i]) for (const g of room.grabbables) {
        if (g.held >= 0) continue;
        const local = hp.clone().sub(g.node.position).applyQuaternion(g.node.quaternion.clone().invert());
        const d = g.localBox.distanceToPoint(local);
        if (d < GRAB_REACH && d < nd) { nd = d; near = g; }
      }
      if (near) near.hover = true;

      if (pressed(1) && !was(1) && near) {                 // grip down: grab
        const iq = handQuatWorld(i).invert();
        near.offP = near.node.position.clone().sub(hp).applyQuaternion(iq);
        near.offQ = iq.clone().multiply(near.node.quaternion);
        near.held = i; near.hist = []; held[i] = near;
        phys.setKinematic(near.body, true); haptic(i, 0.3, 0.04); call(near, 'onGrab', i);
      }
      if (!pressed(1) && was(1) && held[i]) {              // grip up: release + throw
        const g = held[i], h = g.hist; phys.setKinematic(g.body, false);
        if (h.length > 1) {
          const a = h[0], z = h[h.length - 1], dt = Math.max(z.t - a.t, 1e-3);
          g.body.setLinvel(z.p.clone().sub(a.p).divideScalar(dt), true);
          const dq = z.q.clone().multiply(a.q.clone().invert());
          if (dq.w < 0) { dq.x = -dq.x; dq.y = -dq.y; dq.z = -dq.z; dq.w = -dq.w; }
          const ang = 2 * Math.acos(Math.min(1, dq.w)), axis = V(dq.x, dq.y, dq.z);
          if (axis.lengthSq() > 1e-9) g.body.setAngvel(axis.normalize().multiplyScalar(ang / dt), true);
        }
        g.held = -1; held[i] = null; call(g, 'onRelease', i);
      }
      const g = held[i];
      if (g) {
        if (pressed(0) && !was(0)) call(g, 'onTrigger', i);
        if (!pressed(0) && was(0)) call(g, 'onTriggerUp', i);
        if (pressed(4) && !was(4)) call(g, 'onButton', i, 'a');
        if (pressed(5) && !was(5)) call(g, 'onButton', i, 'b');
        const t = grabTarget(g, i);
        g.body.setNextKinematicTranslation(t.p); g.body.setNextKinematicRotation(t.q);
        g.hist.push({ p: t.p, q: t.q, t: now }); if (g.hist.length > 6) g.hist.shift();
      }
      btnWas[i] = b.map(x => x.pressed);
    }
  }

  let snapReady = true, lastT;
  function frame(t, xrFrame) {
    const pose = xrFrame && xrFrame.getViewerPose(renderer.xr.getReferenceSpace());
    if (pose) headLocal.copy(pose.transform.position);
    const ax = pads[1]?.axes?.[2] ?? 0;                   // snap turn, right stick
    if (Math.abs(ax) > 0.7 && snapReady) { player.turn(ax > 0 ? -45 : 45); snapReady = false; }
    if (Math.abs(ax) < 0.3) snapReady = true;
    player.update();
    if (rig.position.y < spawnPos.y - 30) { resetRig(); player.vel.set(0, 0, 0); player.initializeValues(); }

    const now = performance.now() / 1000, dt = Math.min(now - (lastT ?? now), 0.05); lastT = now;
    updateHands(now);
    phys.step(dt);
    for (const g of room.grabbables) {
      const p = g.body.translation(), q = g.body.rotation();
      g.node.position.set(p.x, p.y, p.z); g.node.quaternion.set(q.x, q.y, q.z, q.w);
      if (p.y < spawnPos.y - 30) {
        g.body.setTranslation(g.start.p, true); g.body.setRotation(g.start.q, true);
        g.body.setLinvel({ x: 0, y: 0, z: 0 }, true); g.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      }
      const lit = g.hover && g.held < 0 ? 0.35 : 0;
      for (const m of g.mats) m.emissive.setScalar(lit);
      call(g, 'update', dt);
    }
    handMesh[0].position.copy(player.followers[0]); handMesh[1].position.copy(player.followers[1]);
    renderer.render(scene, camera);
  }

  return {
    // call straight from the click handler (WebXR needs the user gesture)
    start() {
      const req = navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor'] });
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      if (!noise) {
        noise = ac.createBuffer(1, ac.sampleRate * 0.1, ac.sampleRate); const nd = noise.getChannelData(0);
        for (let i = 0; i < nd.length; i++) nd[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ac.sampleRate * 0.012));
      }
      ac.resume();
      return req.then(async session => {
        renderer.domElement.style.display = 'block';
        session.addEventListener('end', () => { renderer.setAnimationLoop(null); renderer.domElement.style.display = 'none'; });
        await renderer.xr.setSession(session);
        renderer.xr.setFoveation(0);   // the projection layer exists now: make sure fixed foveation is off
        resetRig(); player.initializeValues(); lastT = undefined;
        renderer.setAnimationLoop(frame);
      });
    },
    _debug: { scene, rig, camera, renderer, player, phys, room, frame }
  };
}
