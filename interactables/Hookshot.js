// Hookshot (Zelda-style reel-in). Object: Grab_Hookshot with children GrabPoint and Muzzle (fires along Muzzle's +Z).
//   Trigger down : fire. Hit -> reel you in, then hang at the point while trigger is held.
//   Trigger up   : let go. Mid-pull you keep your momentum (fling!); while hanging you drop.
//   Surfaces named with _NoHook can't be hooked. Grabbables can't be hooked.
export default class Hookshot {
  constructor(obj, api) {
    const T = api.THREE;
    Object.assign(this, {
      range: 15,          // m
      hookSpeed: 60,      // m/s, hook flight (visual)
      pullSpeed: 11,      // m/s, reel-in speed
      standOff: 0.35,     // m, stop this far off the surface (head distance)
      stallTime: 0.25     // s without progress = arrived (blocked by something)
    });
    this.obj = obj; this.api = api; this.T = T;
    this.muzzle = obj.getObjectByName('Muzzle') || obj;
    this.state = 'idle'; this.hand = -1;
    this.hookPos = new T.Vector3(); this.target = new T.Vector3(); this.normal = new T.Vector3(); this.hit = false;
    // rope + hook head
    this.rope = new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(), new T.Vector3()]), new T.LineBasicMaterial({ color: 0x333333 }));
    this.rope.frustumCulled = false; this.rope.visible = false; api.scene.add(this.rope);
    this.head = new T.Mesh(new T.ConeGeometry(0.035, 0.09, 10), new T.MeshStandardMaterial({ color: 0xff5a1f }));
    this.head.visible = false; api.scene.add(this.head);
  }

  muzzleWorld() {
    const T = this.T, p = this.muzzle.getWorldPosition(new T.Vector3());
    const d = new T.Vector3(0, 0, 1).applyQuaternion(this.muzzle.getWorldQuaternion(new T.Quaternion()));
    return { p, d };
  }

  onGrab(hand) { this.hand = hand; }
  onRelease() { this.letGo(); this.hand = -1; }
  onTriggerUp() { this.letGo(); }

  onTrigger(hand) {
    if (this.state !== 'idle') return;
    const { p, d } = this.muzzleWorld();
    const hit = this.api.phys.raycast(p, d, this.range);
    const ok = hit && !this.api.phys.infoOf(hit.col).noHook;
    this.hit = !!ok;
    this.target.copy(ok ? hit.point : p.clone().addScaledVector(d, this.range));
    this.normal.copy(ok ? hit.normal : d.clone().negate());
    this.hookPos.copy(p); this.state = 'flying';
    this.api.sound(0.6); this.api.haptic(hand, 0.5, 0.05);
  }

  letGo() {
    if (this.state === 'pulling' || this.state === 'hanging') this.api.player.pull = null;   // velocity stays: momentum carries
    if (this.state !== 'idle') this.state = 'retracting';
  }

  update(dt) {
    const T = this.T, P = this.api.player;
    if (this.state === 'idle') { this.rope.visible = this.head.visible = false; return; }
    const { p: m } = this.muzzleWorld();

    if (this.state === 'flying') {
      const to = this.target.clone().sub(this.hookPos), step = this.hookSpeed * dt;
      if (to.length() <= step) {
        this.hookPos.copy(this.target);
        if (this.hit) { this.state = 'pulling'; this.best = Infinity; this.stall = 0; this.api.sound(1); this.api.haptic(this.hand, 0.8, 0.08); }
        else this.state = 'retracting';
      } else this.hookPos.addScaledVector(to.normalize(), step);
    }
    if (this.state === 'pulling') {
      const dest = this.target.clone().addScaledVector(this.normal, this.standOff);
      const d = dest.sub(P.headPos()), dist = d.length();
      if (dist < this.best - 0.02) { this.best = dist; this.stall = 0; } else this.stall += dt;
      if (dist < this.standOff || this.stall > this.stallTime) { this.state = 'hanging'; this.api.haptic(this.hand, 0.4, 0.05); }
      else P.pull = { vel: d.normalize().multiplyScalar(Math.min(this.pullSpeed, dist / Math.max(dt, 1e-3))) };
    }
    if (this.state === 'hanging') P.pull = { vel: new T.Vector3() };   // hold position while trigger is held
    if (this.state === 'retracting') {
      const to = m.clone().sub(this.hookPos), step = this.hookSpeed * dt;
      if (to.length() <= step) { this.state = 'idle'; this.rope.visible = this.head.visible = false; return; }
      this.hookPos.addScaledVector(to.normalize(), step);
    }
    // visuals
    const pos = this.rope.geometry.attributes.position;
    pos.setXYZ(0, m.x, m.y, m.z); pos.setXYZ(1, this.hookPos.x, this.hookPos.y, this.hookPos.z); pos.needsUpdate = true;
    this.rope.visible = true;
    this.head.visible = true; this.head.position.copy(this.hookPos);
    const dir = this.hookPos.clone().sub(m); if (dir.lengthSq() > 1e-6) this.head.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), dir.normalize());
  }
}
