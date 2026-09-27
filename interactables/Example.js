// Template interactable. Copy this file, rename the class, register it in index.js.
// Think MonoBehaviour: one instance per object in the room.
//
//   this.obj  the object from the .glb (a THREE.Object3D): children by name via this.obj.getObjectByName('Muzzle')
//   api.THREE, api.scene                 three.js + the scene (add effects here)
//   api.haptic(hand, strength, seconds)  hand: 0 = left, 1 = right
//   api.sound(volume)                    the tap sound (swap for your own audio)
//   api.player                           the locomotion (api.player.vel, api.player.followers[hand])
export default class Example {
  constructor(obj, api) {
    this.obj = obj; this.api = api; this.flash = 0;
    this.mats = [];
    obj.traverse(m => { if (m.isMesh && m.material?.color) this.mats.push({ m: m.material, base: m.material.color.clone() }); });
  }
  onGrab(hand) {}
  onRelease(hand) {}
  onTrigger(hand) {            // trigger pressed while held
    this.flash = 1;
    this.api.haptic(hand, 0.6, 0.08);
    this.api.sound(0.8);
  }
  onTriggerUp(hand) {}
  onButton(hand, name) {}      // 'a' (A/X) or 'b' (B/Y) pressed while held
  update(dt) {                 // every frame
    if (this.flash <= 0) return;
    this.flash = Math.max(0, this.flash - dt * 3);
    for (const { m, base } of this.mats) m.color.copy(base).lerp(new this.api.THREE.Color(0xffffff), this.flash);
  }
}
