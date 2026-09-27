// Grip climbing (BotW-style "hold on to any wall"), built into the Gorilla locomotion.
// Hold grip while a hand touches a climbable surface -> that hand is PINNED in the Gorilla solver:
//   - the pinned hand never slides and holds your weight (no gravity while pinned)
//   - the other hand keeps full Gorilla physics: slap / push the wall with it to shift or swing yourself
//   - let go of everything -> you keep your momentum (pull or push hard, then release to launch)
// Tuning: pinWeight / maxFling at the top of the GorillaPlayer constructor in gorilla.js, reach / maxClimbNormalY here.
//
// Climbable = any room collider surface steeper than `maxClimbNormalY` (walls, trunks, rock faces, undersides).
// Name modifiers: `_Grip` = climbable from every side (bars, rungs, ledges); `_NoClimb` = never climbable.

export class Climber {
  constructor(player, phys, opts = {}) {
    Object.assign(this, {
      reach: 0.09,            // hand sphere used to find a surface to hold
      maxClimbNormalY: 0.7    // surfaces flatter than this (floors, tops) are for Gorilla movement, not gripping
    }, opts);
    this.player = player; this.phys = phys;
  }
  get active() { return this.player.anyPinned(); }
  isAnchored(i) { return !!this.player.pins[i]; }

  // A climbable surface under hand i? The Gorilla hand (which rests on surfaces) is the probe.
  findSurface(i) {
    const p = this.player.followers[i];
    let best = null;
    for (const h of this.phys.penetrations(p, this.reach)) {
      const info = this.phys.infoOf(h.col);
      if (info.noClimb) continue;
      if (!info.grip && h.n.y >= this.maxClimbNormalY) continue;
      if (!best || h.pen > best.pen) best = h;
    }
    return best ? p.clone() : null;
  }

  tryAttach(i) {
    if (this.isAnchored(i)) return true;
    const point = this.findSurface(i);
    if (!point) return false;
    this.player.pin(i, point);
    return true;
  }
  release(i) { this.player.unpin(i); }
  releaseAll() { this.release(0); this.release(1); }
}
