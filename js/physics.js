// Rapier adapter: gives the locomotion the same queries Unity's Physics class gave Player.cs
// (SphereCast, Raycast, OverlapSphere) against any collider, including triangle meshes.
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';

// Interaction groups (upper 16 bits = membership, lower 16 = filter)
//  room colliders: member 1, collide with 1|2      grabbables: member 2, collide with room only
//  locomotion queries: member 1, see room only (you can't climb held objects)
export const GROUP_ROOM = (0x0001 << 16) | 0x0003;
export const GROUP_GRAB = (0x0002 << 16) | 0x0001;
const GROUP_QUERY = (0x0001 << 16) | 0x0001;
const ID = { x: 0, y: 0, z: 0, w: 1 };
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const v3 = v => new THREE.Vector3(v.x, v.y, v.z);

export async function createPhysics() {
  await RAPIER.init();
  return new PhysicsWorld();
}

export class PhysicsWorld {
  constructor() {
    this.R = RAPIER;
    this.w = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.w.timestep = 1 / 72;
    this.meta = new Map();      // collider handle -> { slip, grip, noClimb } from name modifiers
    this.accum = 0;
  }

  // ---- building ----
  addBox(center, halfExtents, quat, meta) {
    const d = RAPIER.ColliderDesc.cuboid(halfExtents.x, halfExtents.y, halfExtents.z)
      .setTranslation(center.x, center.y, center.z).setRotation(quat).setCollisionGroups(GROUP_ROOM);
    return this._fixed(d, meta);
  }
  addTrimesh(vertices, indices, meta) {
    const d = RAPIER.ColliderDesc.trimesh(vertices, indices).setCollisionGroups(GROUP_ROOM);
    return this._fixed(d, meta);
  }
  _fixed(desc, meta) {
    const c = this.w.createCollider(desc);
    if (meta) this.meta.set(c.handle, meta);
    return c;
  }
  addDynamic(pos, quat, hullPoints) {
    const body = this.w.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(pos.x, pos.y, pos.z).setRotation(quat).setCcdEnabled(true));
    const desc = RAPIER.ColliderDesc.convexHull(hullPoints) || RAPIER.ColliderDesc.ball(0.05);
    desc.setCollisionGroups(GROUP_GRAB).setRestitution(0.3).setFriction(0.8).setDensity(400);
    this.w.createCollider(desc, body);
    return body;
  }
  setKinematic(body, on) {
    body.setBodyType(on ? RAPIER.RigidBodyType.KinematicPositionBased : RAPIER.RigidBodyType.Dynamic, true);
  }
  // Rapier builds its query index during step(): run one after adding colliders so queries see them.
  refresh() { this.w.step(); }
  step(dt) {
    this.accum += Math.min(dt, 0.1);
    while (this.accum >= this.w.timestep) { this.accum -= this.w.timestep; this.w.step(); }
  }

  // ---- Unity-equivalent queries (return { distance, point, normal, col } or null) ----
  overlapSphere(c, r) {
    return this.w.intersectionWithShape(c, ID, new RAPIER.Ball(r), undefined, GROUP_QUERY) ? 1 : 0;
  }
  raycast(o, d, maxDist) {
    if (maxDist <= 1e-7 || d.lengthSq() < 1e-12) return null;
    const hit = this.w.castRayAndGetNormal(new RAPIER.Ray(o, d), maxDist, false, undefined, GROUP_QUERY);
    if (!hit) return null;
    return { distance: hit.timeOfImpact, point: o.clone().addScaledVector(d, hit.timeOfImpact), normal: v3(hit.normal), col: hit.collider };
  }
  // Unity's SphereCast ignores colliders the sphere already overlaps at its start: skip time-of-impact 0 hits.
  sphereCast(o, r, d, maxDist) {
    if (maxDist <= 1e-7 || d.lengthSq() < 1e-12) return null;
    const ball = new RAPIER.Ball(r); let exclude;
    for (let k = 0; k < 3; k++) {
      const hit = this.w.castShape(o, ID, d, ball, 0, maxDist, false, undefined, GROUP_QUERY, exclude);
      if (!hit) return null;
      if (hit.time_of_impact <= 1e-7) { exclude = hit.collider; continue; }
      const n2 = v3(hit.normal2);                     // ball-local = world (identity rotation), points at the surface
      const t = hit.time_of_impact;
      return { distance: t, point: o.clone().addScaledVector(d, t).addScaledVector(n2, r), normal: n2.negate(), col: hit.collider };
    }
    return null;
  }
  // Push a sphere out of room geometry: [{ n, pen }] (used by the rigidbody stand-in)
  penetrations(c, r) {
    const ball = new RAPIER.Ball(r), out = [];
    this.w.intersectionsWithShape(c, ID, ball, col => {
      const ct = col.contactShape(ball, c, ID, 0);
      if (ct && ct.distance < 0) out.push({ n: v3(ct.normal1), pen: -ct.distance, col });
      return true;
    }, undefined, GROUP_QUERY);
    return out;
  }
  slipOf(col) { return col ? this.meta.get(col.handle)?.slip : undefined; }
  infoOf(col) { return (col && this.meta.get(col.handle)) || {}; }
}
