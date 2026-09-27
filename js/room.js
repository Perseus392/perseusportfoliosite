// Loads a room .glb and turns named objects into gameplay (see CONVENTIONS.md).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const HIDDEN = /_Hidden\b|_Hidden_|_Hidden$/i;
const ICE = /_Ice\b|_Ice_|_Ice$/i;
const GRIP = /_Grip\b|_Grip_|_Grip$/i, NOCLIMB = /_NoClimb\b|_NoClimb_|_NoClimb$/i;
const metaFor = name => ({ slip: ICE.test(name) ? 0.99 : undefined, grip: GRIP.test(name), noClimb: NOCLIMB.test(name) });

// World-space grid shader: depth cues on every surface. Used for any material whose name starts with "Grid".
export const gridMat = (base = new THREE.Color(0xf2f2ef)) => new THREE.ShaderMaterial({
  uniforms: { base: { value: base.clone() }, fogCol: { value: new THREE.Color(0xf7f7f5) } },
  vertexShader: `varying vec3 vW; varying vec3 vN;
    void main(){ vec4 w = modelMatrix*vec4(position,1.); vW=w.xyz; vN=normalize(mat3(modelMatrix)*normal); gl_Position=projectionMatrix*viewMatrix*w; }`,
  fragmentShader: `uniform vec3 base; uniform vec3 fogCol; varying vec3 vW; varying vec3 vN;
    // anti-aliased grid line, faded out where lines get denser than the pixels can show
    float grid(vec2 p){ vec2 w=fwidth(p); vec2 g=abs(fract(p-.5)-.5)/w; float l=1.-min(min(g.x,g.y),1.);
      return l*(1.-smoothstep(.2,.45,max(w.x,w.y))); }
    void main(){ vec3 n=abs(vN); vec2 uv = n.y>=max(n.x,n.z) ? vW.xz : (n.x>=n.z ? vW.zy : vW.xy);
      float major=grid(uv*2.);   // 50 cm lines only: finer lines alias and show resolution seams in the headset
      float shade=.78+.22*max(dot(normalize(vN),normalize(vec3(.4,1.,.3))),0.);
      vec3 c=base*shade; c=mix(c,vec3(.25),major*.45);
      float f=smoothstep(8.,30.,distance(vW,cameraPosition)); gl_FragColor=vec4(mix(c,fogCol,f),1.); }`
});

// Pull world-space triangles out of every mesh under `node`.
function worldTriangles(node) {
  const verts = [], idx = []; let base = 0; const p = V();
  node.updateMatrixWorld(true);
  node.traverse(m => {
    if (!m.isMesh) return;
    const pos = m.geometry.attributes.position, index = m.geometry.index;
    for (let i = 0; i < pos.count; i++) { p.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld); verts.push(p.x, p.y, p.z); }
    if (index) for (let i = 0; i < index.count; i++) idx.push(base + index.getX(i));
    else for (let i = 0; i < pos.count; i++) idx.push(base + i);
    base += pos.count;
  });
  return { verts: new Float32Array(verts), idx: new Uint32Array(idx) };
}

// Oriented box from each mesh's local bounds (rotation + scale supported).
function addBoxes(node, phys, meta) {
  node.updateMatrixWorld(true);
  node.traverse(m => {
    if (!m.isMesh) return;
    m.geometry.computeBoundingBox();
    const bb = m.geometry.boundingBox, c = bb.getCenter(V()), s = bb.getSize(V());
    const wp = V(), wq = new THREE.Quaternion(), ws = V();
    m.matrixWorld.decompose(wp, wq, ws);
    const center = c.applyMatrix4(m.matrixWorld);
    const half = V(Math.abs(s.x * ws.x) / 2, Math.abs(s.y * ws.y) / 2, Math.abs(s.z * ws.z) / 2);
    phys.addBox(center, half, wq, meta);
  });
}

// Transform of `child` relative to `root` position+rotation (root scale baked in).
function relativeToRoot(root, child) {
  const rp = V(), rq = new THREE.Quaternion(), rs = V();
  root.matrixWorld.decompose(rp, rq, rs);
  const inv = new THREE.Matrix4().compose(rp, rq, V(1, 1, 1)).invert();
  const m = inv.multiply(child.matrixWorld), p = V(), q = new THREE.Quaternion(), s = V();
  m.decompose(p, q, s);
  return { p, q };
}

export async function loadRoom(url, scene, phys) {
  const gltf = await new GLTFLoader().loadAsync(url);
  const root = gltf.scene; scene.add(root); root.updateMatrixWorld(true);
  const out = { spawn: null, banner: null, cards: [], grabbables: [] };

  // Grid materials
  root.traverse(m => {
    if (!m.isMesh) return;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    const swapped = mats.map(mat => (mat && /^Grid/i.test(mat.name || '')) ? gridMat(mat.color || new THREE.Color(0xf2f2ef)) : mat);
    m.material = Array.isArray(m.material) ? swapped : swapped[0];
  });

  // Walk the tree; a Col_/ColBox_/Grab_ node claims its whole subtree.
  const grabNodes = [];
  const walk = node => {
    const name = node.name || '';
    const meta = metaFor(name);
    if (/^Spawn/i.test(name)) out.spawn = node;
    else if (/^Banner/i.test(name)) out.banner = node;
    else if (/^Card_(\d+)/i.test(name)) out.cards[+name.match(/^Card_(\d+)/i)[1]] = node;
    if (/^ColBox_/i.test(name)) { addBoxes(node, phys, meta); if (HIDDEN.test(name)) node.visible = false; return; }
    if (/^Col_/i.test(name)) { const t = worldTriangles(node); if (t.idx.length) phys.addTrimesh(t.verts, t.idx, meta); if (HIDDEN.test(name)) node.visible = false; return; }
    if (/^Grab_/i.test(name)) { grabNodes.push(node); return; }
    if (HIDDEN.test(name)) node.visible = false;
    [...node.children].forEach(walk);
  };
  walk(root);

  // Grabbables: dynamic Rapier bodies with a convex hull collider.
  for (const node of grabNodes) {
    scene.attach(node); node.updateMatrixWorld(true);
    const wp = V(), wq = new THREE.Quaternion(), ws = V();
    node.matrixWorld.decompose(wp, wq, ws);
    const toLocal = new THREE.Matrix4().compose(wp, wq, V(1, 1, 1)).invert();
    const pts = []; const p = V();
    node.traverse(m => {
      if (!m.isMesh) return;
      const m2 = toLocal.clone().multiply(m.matrixWorld), pos = m.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) { p.fromBufferAttribute(pos, i).applyMatrix4(m2); pts.push(p.x, p.y, p.z); }
    });
    const grabPoints = {};
    node.traverse(c => { const mm = (c.name || '').match(/^GrabPoint(?:_([LR]))?/i); if (mm) grabPoints[(mm[1] || 'any').toUpperCase()] = relativeToRoot(node, c); });
    const type = (node.name.split('_')[1] || '').split(/[^A-Za-z0-9]/)[0];
    const body = phys.addDynamic(wp, wq, new Float32Array(pts));
    out.grabbables.push({ node, body, type, grabPoints, held: -1, hist: [] });
  }
  phys.refresh();
  return out;
}
