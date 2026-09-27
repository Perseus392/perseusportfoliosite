// 1:1 port of GorillaLocomotion.Player (Unity) to Three.js.
// Unity Physics queries (SphereCast / Raycast / OverlapSphere) come from the Rapier world in physics.js.
// Rigidbody = rig position + `vel`, integrated at a fixed 50 Hz step (head sphere + body capsule push out of the room).
import * as THREE from 'three';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0), DOWN = V(0, -1, 0);
const EMPTY_HIT = () => ({ distance: 0, point: V(), normal: V(), col: null });
const norm = v => (v.lengthSq() > 1e-12 ? v.clone().normalize() : V());
const project = (v, n) => { const d = n.lengthSq(); return d < 1e-12 ? V() : n.clone().multiplyScalar(v.dot(n) / d); };
const projectOnPlane = (v, n) => v.clone().sub(project(v, n));

// ---------- the player ----------
// input: { head(): local Vector3, hand(i): local Vector3, handQuat(i): local Quaternion,
//          haptic(i, amp, sec), tapSound(i), slipSound(i, on) }   i: 0 = left, 1 = right
export class GorillaPlayer {
  constructor(rig, world, input, p = {}) {
    Object.assign(this, {
      velocityHistorySize: 8, velocityLimit: 0.4, slideVelocityLimit: 0.7, minimumRaycastDistance: 0.05,
      maxArmLength: 1.5, unStickDistance: 1, defaultPrecision: 0.995, teleportThresholdNoVel: 1,
      maxJumpSpeed: 6.5, jumpMultiplier: 1.1, defaultSlideFactor: 0.03, slideControl: 0.00425,
      stickDepth: 0.008, iceThreshold: 0.95, tapHapticDuration: 0.05, tapHapticStrength: 0.5,
      slideHapticStrength: 0.075, tapCoolDown: 0.15, headRadius: 0.0924, bodyRadius: 0.14, bodyHeight: 0.5,
      fixedDelta: 0.02, gravity: -9.81, disableMovement: false, groundFriction: 2.0,
      // impact SFX: min hand speed into the surface, hand must be off the surface this long / this far to re-arm
      pinWeight: 3,            // climbing: how strongly a pinned (gripping) hand holds you vs a free Gorilla hand pushing
      maxFling: 4.5,           // climbing: cap on momentum carried out when you let go
      tapMinImpact: 0.35, tapMaxImpact: 2.5, tapRearmTime: 0.08, tapRearmDistance: 0.03
    }, p);
    this.rig = rig; this.world = world; this.input = input;
    this.vel = V();
    this.body = { radius: this.bodyRadius, height: this.bodyHeight, active: true };
    this.bodyLerp = 0.17;
    this.crazyCheckVectors = [V(0,1,0), V(0,-1,0), V(-1,0,0), V(1,0,0), V(0,0,1), V(0,0,-1), V()];
    this.accum = 0;
    this.initializeValues();
  }

  // --- transforms ---
  toWorld(v) { this.rig.updateMatrixWorld(); return v.clone().applyMatrix4(this.rig.matrixWorld); }
  headPos() { return this.toWorld(this.input.head()); }
  handRaw(i) { return this.toWorld(this.input.hand(i)); }
  handForward(i) {
    const q = this.rig.quaternion.clone().multiply(this.input.handQuat(i));
    return V(0, 0, -1).applyQuaternion(q);
  }
  currentHandPosition(i) {
    const h = this.handRaw(i), head = this.headPos();
    return h.distanceTo(head) < this.maxArmLength ? h : head.add(norm(h.clone().sub(head)).multiplyScalar(this.maxArmLength));
  }

  initializeValues() {
    this.velocityHistory = Array.from({ length: this.velocityHistorySize }, () => V());
    this.lastHand = [this.currentHandPosition(0), this.currentHandPosition(1)];
    this.lastHeadPosition = this.headPos();
    this.lastOpenHeadPosition = this.lastHeadPosition.clone();
    this.velocityIndex = 0;
    this.denormalizedVelocityAverage = V();
    this.slideAverage = V(); this.slideAverageNormal = V(0, 1, 0);
    this.lastPosition = this.rig.position.clone();
    this.lastRealTime = performance.now() / 1000;
    this.colliding = [false, false]; this.wasTouching = [false, false];
    this.slide = [false, false]; this.wasSlide = [false, false];
    this.slideNormal = [V(0,1,0), V(0,1,0)]; this.slipPct = [0, 0];
    this.touching = [false, false]; this.lastTap = [0, 0]; this.slipPlaying = [false, false];
    this.didAJump = false; this.didATurn = false;
    this.pins = this.pins || [null, null];
    this.prevRaw = [this.lastHand[0].clone(), this.lastHand[1].clone()];
    this.handVel = [V(), V()]; this.armed = [true, true]; this.offSince = [0, 0];
    this.contactPoint = [this.lastHand[0].clone(), this.lastHand[1].clone()];
    this.followers = [this.lastHand[0].clone(), this.lastHand[1].clone()];
  }

  // Called once per rendered frame. Runs FixedUpdate/physics steps, then LateUpdate.
  update() {
    const now = performance.now() / 1000;
    let frameDt = now - (this._lastFrame ?? now); this._lastFrame = now;
    this.accum += Math.min(frameDt, 0.1);
    while (this.accum >= this.fixedDelta) { this.accum -= this.fixedDelta; this.fixedUpdate(); this.physicsStep(this.fixedDelta); }
    this.lateUpdate();
  }

  fixedUpdate() {
    const head = this.headPos();
    if (head.distanceTo(this.lastHeadPosition) >= this.teleportThresholdNoVel + this.vel.length() * (this.calcDeltaTime || 0))
      this.rig.position.add(this.lastHeadPosition.clone().sub(head));
  }

  // Unity Rigidbody stand-in: gravity + head sphere & body capsule collisions.
  physicsStep(dt) {
    if (!this.anyPinned()) this.vel.y += this.gravity * dt;
    this.rig.position.addScaledVector(this.vel, dt);
    let grounded = false;
    const resolve = (c, r) => {
      for (const { n, pen } of this.world.penetrations(c, r)) {
        this.rig.position.addScaledVector(n, pen); c.addScaledVector(n, pen);
        const vn = this.vel.dot(n); if (vn < 0) this.vel.addScaledVector(n, -vn);
        if (n.y > 0.7) grounded = true;
      }
    };
    for (let it = 0; it < 2; it++) {
      resolve(this.headPos(), this.headRadius);
      if (this.body.active) {
        const r = this.body.radius, h = Math.max(this.body.height, 2 * r);
        for (let k = 0; k < 4; k++) {
          const off = r + (h - 2 * r) * (k / 3);
          resolve(this.headPos().add(V(0, -off, 0)), r);
        }
      }
    }
    // Ground friction (Unity's default physic material has friction; the MVP had none -> body slid on flat ground)
    if (grounded) {
      const h = Math.hypot(this.vel.x, this.vel.z);
      if (h > 0) { const k = Math.max(0, h - this.groundFriction * 9.81 * dt) / h; this.vel.x *= k; this.vel.z *= k; }
    }
  }

  bodyColliderUpdate() {
    const head = this.headPos();
    const m = this.maxSphereSizeForNoOverlap(this.bodyRadius, head);
    if (m.ok) {
      this.body.radius = m.r;
      const hit = this.world.sphereCast(head, m.r, DOWN, this.bodyHeight - m.r);
      this.body.height = hit ? hit.distance + m.r : this.bodyHeight;
      this.body.active = true;
    } else this.body.active = false;
    this.body.height += (this.bodyHeight - this.body.height) * this.bodyLerp;
    this.body.radius += (this.bodyRadius - this.body.radius) * this.bodyLerp;
  }

  lateUpdate() {
    let rigidBodyMovement = V();
    const t = performance.now() / 1000;
    let dt = t - this.lastRealTime; this.lastRealTime = t;
    if (dt > 0.1) dt = 0.05;
    this.calcDeltaTime = dt;
    for (let i = 0; i < 2; i++) { const r = this.currentHandPosition(i); this.handVel[i].copy(r).sub(this.prevRaw[i]).divideScalar(dt || 1e-3); this.prevRaw[i] = r; }
    const pos = this.rig.position, dva = this.denormalizedVelocityAverage, san = this.slideAverageNormal;

    if (!this.didAJump && !this.anyPinned() && (this.wasTouching[0] || this.wasTouching[1])) {
      pos.addScaledVector(DOWN, 4.9 * dt * dt);
      if (dva.dot(san) <= 0 && DOWN.dot(san) <= 0)
        pos.sub(project(san.clone().multiplyScalar(Math.min(this.stickDepth, project(dva, san).length() * dt)), DOWN));
    }
    if (!this.didAJump && (this.wasSlide[0] || this.wasSlide[1])) {
      pos.addScaledVector(this.slideAverage, dt);
      this.slideAverage.addScaledVector(DOWN, 9.8 * dt);
    }

    const first = [this.firstHandIteration(0), this.firstHandIteration(1)];
    let touchPoints = 0;
    for (let i = 0; i < 2; i++) if (this.colliding[i] || this.wasTouching[i]) {
      const w = this.pins[i] ? this.pinWeight : 1;   // (original: plain average of touching hands)
      rigidBodyMovement.addScaledVector(first[i], w); touchPoints += w;
    }
    if (touchPoints) rigidBodyMovement.divideScalar(touchPoints);

    const hr = this.headRadius * 0.4;
    let m1 = this.maxSphereSizeForNoOverlap(hr, this.lastHeadPosition);
    if (!m1.ok && !this.crazyCheck2(hr * 0.75, this.lastHeadPosition)) this.lastHeadPosition = this.lastOpenHeadPosition.clone();
    const head = this.headPos();
    const it = this.iterativeCollisionSphereCast(this.lastHeadPosition, hr, head.clone().add(rigidBodyMovement).sub(this.lastHeadPosition), false, true);
    if (it.hit) rigidBodyMovement = it.end.clone().sub(head);
    const probe = this.lastHeadPosition.clone().add(rigidBodyMovement);
    m1 = this.maxSphereSizeForNoOverlap(hr, probe);
    if (!m1.ok || !this.crazyCheck2(hr * 0.75, probe)) {
      this.lastHeadPosition = this.lastOpenHeadPosition.clone();
      rigidBodyMovement = this.lastHeadPosition.clone().sub(head);
    } else if (hr * 0.825 < m1.r) this.lastOpenHeadPosition = head.clone().add(rigidBodyMovement);

    if (rigidBodyMovement.lengthSq() > 0) pos.add(rigidBodyMovement);

    this.lastHeadPosition = this.headPos();
    const areBothTouching = (!this.colliding[0] && !this.wasTouching[0]) || (!this.colliding[1] && !this.wasTouching[1]);
    for (let i = 0; i < 2; i++) this.lastHand[i] = this.pins[i] ? this.pins[i].point.clone() : this.finalHandPosition(i, areBothTouching);
    this.storeVelocities();
    this.didAJump = false;

    if (this.slide[0] || this.slide[1]) {
      const n = V(); let tp = 0, avgSlip = 0;
      for (let i = 0; i < 2; i++) if (this.slide[i]) { n.add(norm(this.slideNormal[i])); avgSlip += this.slipPct[i]; tp++; }
      this.slideAverageNormal = norm(n); avgSlip /= tp;
      const S = this.slideAverageNormal;
      if (tp === 1) {
        const i = this.slide[1] ? 1 : 0;
        const surfaceDirection = projectOnPlane(this.handForward(i), this.slideNormal[i]);
        const sa = this.slideAverage, dir = sa.dot(surfaceDirection) > 0 ? 1 : -1;
        const target = norm(surfaceDirection).multiplyScalar(dir * sa.length());
        this.slideAverage = project(sa, slerpVec(sa, target, this.slideControl));
      }
      if (!this.wasSlide[0] && !this.wasSlide[1])
        this.slideAverage = this.vel.dot(S) <= 0 ? projectOnPlane(this.vel, S) : this.vel.clone();
      else
        this.slideAverage = this.slideAverage.dot(S) <= 0 ? projectOnPlane(this.slideAverage, S) : this.slideAverage;
      this.slideAverage = norm(this.slideAverage).multiplyScalar(Math.min(this.slideAverage.length(), Math.max(0.5, this.denormalizedVelocityAverage.length() * 2)));
      this.vel.set(0, 0, 0);
    } else if (this.colliding[0] || this.colliding[1]) {
      if (!this.didATurn) this.vel.set(0, 0, 0);
      else this.vel.setLength(Math.min(2, this.vel.length()));
    } else if (this.wasSlide[0] || this.wasSlide[1]) {
      const S = this.slideAverageNormal;
      this.vel.copy(this.slideAverage.dot(S) <= 0 ? projectOnPlane(this.slideAverage, S) : this.slideAverage);
    }

    const D = this.denormalizedVelocityAverage;
    if ((this.colliding[0] || this.colliding[1]) && !this.disableMovement && !this.didATurn && !this.anyPinned()) {
      if (this.slide[0] || this.slide[1]) {
        const S = this.slideAverageNormal, pd = project(D, S).length();
        if (pd > this.slideVelocityLimit && D.dot(S) > 0 && pd > project(this.slideAverage, S).length()) {
          this.slide[0] = this.slide[1] = false; this.didAJump = true;
          this.vel.copy(norm(S).multiplyScalar(Math.min(this.maxJumpSpeed, this.jumpMultiplier * pd)).add(projectOnPlane(this.slideAverage, S)));
        }
      } else if (D.length() > this.velocityLimit) {
        this.didAJump = true;
        this.vel.copy(norm(D).multiplyScalar(Math.min(this.maxJumpSpeed, this.jumpMultiplier * D.length())));
      }
    }

    for (let i = 0; i < 2; i++) {
      if (!this.colliding[i] || this.pins[i]) continue;
      const cur = this.currentHandPosition(i), h = this.headPos(), toHand = cur.clone().sub(h);
      if (cur.distanceTo(this.lastHand[i]) > this.unStickDistance && !this.world.raycast(h, norm(toHand), toHand.length())) {
        this.lastHand[i] = cur; this.colliding[i] = false;
      }
    }

    for (let i = 0; i < 2; i++) {
      this.followers[i].copy(this.lastHand[i]);
      this.wasTouching[i] = this.colliding[i]; this.wasSlide[i] = this.slide[i];
    }
    this.didATurn = false;
    this.bodyColliderUpdate();

    const time = performance.now() / 1000;
    // Impact SFX (replaces "play on every contact"):
    //  - fires only on a contact START, with the hand moving INTO the surface faster than tapMinImpact
    //  - volume + haptic strength scale with impact speed, pitch is randomised slightly
    //  - hysteresis: a hand must leave the surface for tapRearmTime AND tapRearmDistance before it can tap again,
    //    so resting / jittering / dragging hands stay silent. Cooldown from the original is kept on top.
    for (let i = 0; i < 2; i++) {
      const touchingNow = this.wasTouching[i];
      if (touchingNow && !this.touching[i]) {
        const impact = -this.handVel[i].dot(norm(this.slideNormal[i]));
        if (this.armed[i] && impact > this.tapMinImpact && time > this.lastTap[i] + this.tapCoolDown) {
          const k = THREE.MathUtils.clamp((impact - this.tapMinImpact) / (this.tapMaxImpact - this.tapMinImpact), 0, 1);
          this.input.tapSound?.(i, 0.15 + 0.85 * k);
          this.input.haptic?.(i, this.tapHapticStrength * (0.4 + 0.6 * k), this.tapHapticDuration);
          this.lastTap[i] = time;
        }
        this.armed[i] = false; this.contactPoint[i].copy(this.lastHand[i]);
      }
      if (touchingNow) this.offSince[i] = 0;
      else {
        if (!this.offSince[i]) this.offSince[i] = time;
        if (time - this.offSince[i] > this.tapRearmTime && this.lastHand[i].distanceTo(this.contactPoint[i]) > this.tapRearmDistance) this.armed[i] = true;
      }
      this.touching[i] = touchingNow;
    }
  }

  // ---- grip climbing: a pinned hand is a Gorilla hand locked to a surface point (never slides, never unsticks,
  //      no gravity sag, no jumps). The free hand keeps full Gorilla physics; both corrections are averaged. ----
  anyPinned() { return !!(this.pins[0] || this.pins[1]); }
  pin(i, surfacePoint) {
    const off = this.currentHandPosition(i).sub(surfacePoint);   // keep the real hand where it is: no snap on attach
    this.pins[i] = { point: surfacePoint.clone(), offset: off };
    this.lastHand[i].copy(surfacePoint); this.colliding[i] = this.wasTouching[i] = true; this.slide[i] = false;
    this.vel.set(0, 0, 0);
  }
  unpin(i) {
    if (!this.pins[i]) return;
    this.pins[i] = null;
    if (!this.anyPinned()) {   // let go: carry the climb's momentum (a free hand still on a surface can add a Gorilla push)
      const v = this.denormalizedVelocityAverage.clone();
      if (v.length() > this.maxFling) v.setLength(this.maxFling);
      this.vel.copy(v);
    }
  }

  firstHandIteration(i) {
    const pin = this.pins[i];
    if (pin) {   // target: keep the real hand at (pin point + attach offset)
      this.colliding[i] = true; this.slide[i] = false; this.slideNormal[i] = V(0, 1, 0); this.slipPct[i] = 0;
      return pin.point.clone().add(pin.offset).sub(this.currentHandPosition(i));
    }
    let firstIteration = V();
    const cur = this.currentHandPosition(i), last = this.lastHand[i];
    const distanceTraveled = cur.clone().sub(last);
    if (!this.didAJump && this.wasSlide[i] && this.slideNormal[i].dot(UP) > 0)
      distanceTraveled.add(project(this.slideAverageNormal.clone().multiplyScalar(-this.stickDepth), DOWN));
    const r = this.iterativeCollisionSphereCast(last, this.minimumRaycastDistance, distanceTraveled, true, false);
    if (r.hit) {
      firstIteration = (this.wasTouching[i] && r.slip <= this.defaultSlideFactor) ? last.clone().sub(cur) : r.end.clone().sub(cur);
      this.slipPct[i] = r.slip; this.slide[i] = r.slip > this.iceThreshold;
      this.slideNormal[i] = r.hitInfo.normal.clone(); this.colliding[i] = true;
      return firstIteration;
    }
    this.slipPct[i] = 0; this.slide[i] = false; this.slideNormal[i] = V(0, 1, 0); this.colliding[i] = false;
    return firstIteration;
  }

  finalHandPosition(i, bothTouching) {
    const cur = this.currentHandPosition(i), last = this.lastHand[i];
    const r = this.iterativeCollisionSphereCast(last, this.minimumRaycastDistance, cur.clone().sub(last), bothTouching, false);
    if (r.hit) { this.colliding[i] = true; this.slide[i] = r.slip > this.iceThreshold; return r.end; }
    return cur;
  }

  iterativeCollisionSphereCast(start, radius, move, singleHand, fullSlide) {
    let slip = this.defaultSlideFactor;
    const a = this.collisionsSphereCast(start, radius, move);
    if (!a.hit) return { hit: false, end: V(), slip, hitInfo: a.hitInfo };
    const firstPosition = a.end; let hitInfo = a.hitInfo;
    const slideFactor = this.getSlidePercentage(hitInfo);
    slip = slideFactor !== this.defaultSlideFactor ? slideFactor : (!singleHand ? this.defaultSlideFactor : 0.001);
    if (fullSlide) slip = 1;
    const target = start.clone().add(move);
    const proj = projectOnPlane(target.clone().sub(firstPosition), hitInfo.normal).multiplyScalar(slip);
    const b = this.collisionsSphereCast(firstPosition, radius, proj);
    if (b.hit) return { hit: true, end: b.end, slip, hitInfo: b.hitInfo };
    const from = proj.clone().add(firstPosition);
    const c = this.collisionsSphereCast(from, radius, target.clone().sub(from));
    if (c.hit) return { hit: true, end: c.end, slip, hitInfo: c.hitInfo };
    return { hit: false, end: V(), slip, hitInfo };
  }

  collisionsSphereCast(start, radius, move) {
    const W = this.world, m1 = this.maxSphereSizeForNoOverlap(radius, start).r;
    const md = norm(move), ml = move.length();
    const h = W.sphereCast(start, m1, md, ml);
    if (h) {
      let hitInfo = h;
      let finalPosition = h.point.clone().addScaledVector(h.normal, radius);
      let d = finalPosition.clone().sub(start);
      const h2 = W.raycast(start, norm(d), d.length());
      if (h2) finalPosition = start.clone().addScaledVector(md, h2.distance);
      const m2 = this.maxSphereSizeForNoOverlap(radius, finalPosition).r;
      d = finalPosition.clone().sub(start);
      const h3 = W.sphereCast(start, Math.min(m1, m2), norm(d), d.length());
      if (h3) { finalPosition = start.clone().addScaledVector(norm(d), h3.distance); hitInfo = h3; }
      d = finalPosition.clone().sub(start);
      const h4 = W.raycast(start, norm(d), d.length());
      if (h4) { hitInfo = h4; finalPosition = start.clone(); }
      return { hit: true, end: finalPosition, hitInfo };
    }
    const h5 = W.raycast(start, md, ml);
    if (h5) return { hit: true, end: start.clone(), hitInfo: h5 };
    return { hit: false, end: start.clone().add(move), hitInfo: EMPTY_HIT() };
  }

  getSlidePercentage(hit) {
    const s = this.world.slipOf(hit.col);
    if (s != null) return s <= this.defaultSlideFactor ? this.defaultSlideFactor : s;
    return this.defaultSlideFactor;
  }

  turn(degrees) {
    const head = this.headPos();
    this.rig.rotateY(THREE.MathUtils.degToRad(degrees));
    this.rig.position.add(head.sub(this.headPos()));
    const q = new THREE.Quaternion().setFromAxisAngle(UP, THREE.MathUtils.degToRad(degrees));
    this.denormalizedVelocityAverage.set(0, 0, 0);
    for (const v of this.velocityHistory) { v.applyQuaternion(q); this.denormalizedVelocityAverage.add(v); }
    this.didATurn = true;
  }

  storeVelocities() {
    this.velocityIndex = (this.velocityIndex + 1) % this.velocityHistorySize;
    this.velocityHistory[this.velocityIndex] = this.rig.position.clone().sub(this.lastPosition).divideScalar(this.calcDeltaTime || 1e-3);
    this.denormalizedVelocityAverage = V();
    for (const v of this.velocityHistory) this.denormalizedVelocityAverage.add(v);
    this.denormalizedVelocityAverage.divideScalar(this.velocityHistorySize);
    this.lastPosition = this.rig.position.clone();
  }

  maxSphereSizeForNoOverlap(testRadius, pos) {
    let r = testRadius, attempts = 0;
    while (attempts < 100 && r > testRadius * 0.75) {
      if (this.world.overlapSphere(pos, r) <= 0) return { ok: true, r: r * 0.995 };
      r *= 0.99; attempts++;
    }
    return { ok: false, r };
  }

  crazyCheck2(size, start) {
    for (const v of this.crazyCheckVectors) if (this.world.raycast(start, norm(v), size)) return false;
    return true;
  }

  isHandTouching(i) { return this.wasTouching[i]; }
  isHandSliding(i) { return this.wasSlide[i] || this.slide[i]; }
}

// Unity Vector3.Slerp (treats vectors as directions + lerps magnitude)
function slerpVec(a, b, t) {
  const la = a.length(), lb = b.length();
  if (la < 1e-9 || lb < 1e-9) return a.clone().lerp(b, t);
  const na = a.clone().divideScalar(la), nb = b.clone().divideScalar(lb);
  const dot = THREE.MathUtils.clamp(na.dot(nb), -1, 1), ang = Math.acos(dot) * t;
  let rel = nb.clone().sub(na.clone().multiplyScalar(dot));
  if (rel.lengthSq() < 1e-12) return na.multiplyScalar(la + (lb - la) * t);
  rel.normalize();
  return na.multiplyScalar(Math.cos(ang)).add(rel.multiplyScalar(Math.sin(ang))).multiplyScalar(la + (lb - la) * t);
}
