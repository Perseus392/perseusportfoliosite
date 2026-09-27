# Room conventions

A room is a single `.glb` file in `rooms/`. The site reads **object names** to decide what's what.
Everything not named below is just visual.

`rooms/room.glb` loads by default. Other rooms load with `?room=name` (e.g. `yoursite/?room=arena` loads `rooms/arena.glb`).

## Names

| Name starts with | What it becomes | Notes |
|---|---|---|
| `ColBox_` | **Box collider** (climbable) | Fitted to each mesh's bounds. Rotation and scale work. Fastest and most reliable: use for floors, walls, platforms. |
| `Col_` | **Mesh collider** (climbable) | Uses the actual triangles: terrain, rocks, curved shapes. Keep these low-poly. |
| `Grab_<Type>` | **Grabbable** physics object | Grip to grab, release to throw. Collides with the room only, not with other grabbables. `<Type>` picks a script (see Interactables). |
| `Card_0`, `Card_1`, … | **Portfolio card** spot (empty) | Card N shows the Nth card in `content.js`. The card faces the object's **blue Z arrow**. Scale X/Y resizes it (1 = 1.6 m). |
| `Banner` | Name banner spot (empty) | Faces its blue Z arrow. |
| `Spawn` | Player start (empty) | Player looks along its blue Z arrow. |

Name modifiers (put anywhere after the prefix):

| Modifier | Effect |
|---|---|
| `_Hidden` | Collider only, not drawn. E.g. `Col_Terrain_Hidden` as a simple collision shape over a detailed visual mesh. |
| `_Ice` | Slippery surface (the ported slide code). Sliding is off unless you use this. |
| `_Grip` | Grip-climbable from **every** side, including tops: bars, rungs, branches, ledges. |
| `_NoClimb` | Never grip-climbable (Gorilla movement still works on it). |
| `_NoHook` | The hookshot can't attach to it. |

- A prefix applies to the **whole object and its children**: a `Col_Rock` parent with 3 child meshes makes 3 mesh colliders.
- Unity's duplicate suffixes are fine: `ColBox_Pillar (3)` still works.

## Grabbables

- **Default grab:** the object sticks to your hand wherever you grabbed it.
- **Grab pose:** add an empty child called `GrabPoint`. When grabbed, the object snaps so the GrabPoint sits in your fist:
  - blue **Z** arrow = the direction your fist points (e.g. down a gun barrel)
  - green **Y** arrow = up, out of the top of your fist
  - `GrabPoint_L` / `GrabPoint_R` = a different pose per hand (falls back to `GrabPoint`)
- **Collision shape:** a convex hull of the object's meshes (like a Unity convex MeshCollider).
- Grabbables that fall out of the world respawn where they started.

## Climbing (grip)

- Hold **grip** with an empty hand against a climbable surface: the hand locks on (it turns orange, with a buzz) and moving that hand moves your body. Go hand over hand.
- Climbing runs **inside** the Gorilla solver: a gripping hand is a Gorilla hand pinned to the wall (no sliding, no gravity), while your other hand keeps full Gorilla physics. Hang with one hand and slap or push the wall with the other to shift yourself; shove and let go to launch off. Letting go of everything keeps your momentum (pull down hard and release to vault up onto a ledge).
- **Climbable by default:** every `Col_`/`ColBox_` surface steeper than a slope (walls, trunks, rock faces, undersides).
- **Not climbable by default:** floors and flat tops, which are for Gorilla movement. Add `_Grip` to make the tops climbable too (bars), or `_NoClimb` to turn a wall off.
- Grabbables win: grip near a grabbable picks it up instead of climbing.
- Tuning: `reach` and `maxClimbNormalY` in `js/climb.js`; `pinWeight` (how much the gripping hand dominates a pushing free hand; lower = free hand pushes you around more) and `maxFling` at the top of the GorillaPlayer constructor in `js/gorilla.js`.
- The starter room has a climbing playground behind the spawn (turn around): a jungle gym with a ladder and monkey bars, a 4 m climbing tower, trees with hang-able branches, boulders and a small mountain.

## Hookshot

- `Grab_Hookshot` (starter room: on the blue-grey stand near the playground). Pick it up, **trigger** fires along the barrel (15 m).
- Hit: you're reeled in, then hang at the point while trigger is held. Release mid-pull to keep your momentum and fling; release while hanging to drop (or grab the wall and climb).
- Needs child empties `Muzzle` (fires along its blue Z arrow) and `GrabPoint`. Tuning (`range`, `pullSpeed`, `standOff`) at the top of `interactables/Hookshot.js`.
- The starter room has three floating platforms only the hookshot can reach.
- Scripts can pull the player the same way: set `api.player.pull = { vel }` each frame, `null` to stop.

## Materials

- Material name starts with **`Grid`** (e.g. `Grid_Floor`) → the white world-space grid shader, tinted by the material's base colour. Good for greybox and depth perception.
- Any other material keeps its colour/texture (standard PBR). Custom Unity shaders don't export.
- Real-time Unity lights don't export. The site adds its own soft lighting. For nice lighting, bake it into textures.

## Interactables (scripts on objects)

1. Name the object `Grab_MyThing` (the word after `Grab_` is the type).
2. Copy `interactables/Example.js` to `interactables/MyThing.js`, rename the class.
3. Add a line to `interactables/index.js`: `MyThing: () => import('./MyThing.js'),`
4. Use child empties for points your script needs (`Muzzle`, `Tip`, …) and find them with `this.obj.getObjectByName('Muzzle')`.

Hooks: `onGrab(hand)`, `onRelease(hand)`, `onTrigger(hand)`, `onTriggerUp(hand)`, `onButton(hand, 'a'|'b')`, `update(dt)`. `hand` is 0 = left, 1 = right.
The starter room has `Grab_Example`: a small blaster with a GrabPoint that flashes and buzzes on trigger.

## Unity workflow

**One-time setup:** install **UnityGLTF** (does import and export).
Package Manager → `+` → *Add package from git URL* → `https://github.com/KhronosGroup/UnityGLTF.git`
(It's also on OpenUPM as `org.khronos.unitygltf`.) Don't install glTFast alongside it; they both claim `.glb` files.

**Edit the room:**
1. Drag `rooms/room.glb` into your Unity `Assets` folder, then drag it into a scene. Right-click it → *Prefab → Unpack Completely* so you can edit it.
2. Move / add / rename objects using the names above. 1 Unity unit = 1 metre. Y is up.
3. Select the root object (`Room`) → export it with UnityGLTF as **GLB** (right-click menu or the UnityGLTF export menu; the exact menu name varies by version). Save it as `room.glb`.
4. Replace `rooms/room.glb` in the site folder, test locally, push.

**Tips**
- Keep the whole room under ~5–10 MB so it loads fast on Quest.
- Collision is only as good as your colliders: prefer `ColBox_` blocks; use `Col_` meshes for terrain and keep them simple.
- Blender works too: same names, *File → Export → glTF 2.0 (.glb)*, with "+Y Up" on.
- If a card, spawn or GrabPoint comes out facing backwards after a round trip, rotate it 180° on Y. (Importers convert Unity's left-handed axes; the arrows should survive, but check once.)
