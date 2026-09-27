PORTFOLIO SITE - quick guide

FILES
  index.html            the 2D page (don't need to touch)
  content.js            ALL your text, links, images, videos. Edit this.
  rooms/room.glb        the VR room. Edit in Unity or Blender (see CONVENTIONS.md)
  interactables/        scripts for grabbable objects (Example.js = template)
  js/gorilla.js         Gorilla Tag locomotion, ported 1:1 from Player.cs (tuning values at the top)
  js/physics.js         Rapier physics (the Unity Physics equivalent)
  js/room.js            reads the room .glb + naming conventions
  js/vr.js              VR mode: cards, hands, grabbing
  js/climb.js           grip climbing (BotW-style)
  media/                your images and short clips
  CONVENTIONS.md        naming rules + Unity import/export steps

ADD AN IMAGE / CLIP (2D site)
  1. Drop the file in media/ (e.g. media/spiral.jpg)
  2. In content.js, inside that project's  media: [ ]  add one of:
       { type: "image", src: "media/spiral.jpg", caption: "Spiral track" },
       { type: "video", src: "media/squish.mp4" },     (short loop, under 5 MB)
       { type: "youtube", id: "BGf_m5LxwDM" },          (the part after watch?v=)

UPDATING YOUR GITHUB REPO FROM THE OLD VERSION
  Upload everything in this folder, then DELETE the old gorilla.js and vr.js
  from the top level of the repo (they now live in js/).

AFTER CHANGING CODE (js/, interactables/, rooms/)
  Bump the build number in index.html (window.BUILD and the ?v= numbers in the import map).
  The page footer and the VR banner show "build N", so you can confirm the headset loaded the new version.

TEST LOCALLY
  In this folder:  npx serve -l 8000   then open http://localhost:8000
  On Quest over USB:  adb reverse tcp:8000 tcp:8000   then open http://localhost:8000 in the Quest browser

VR CONTROLS
  Gorilla Tag movement. Right stick = snap turn.
  Grip = grab / throw objects, or hold grip against a wall to climb (hand turns orange).
  Trigger, A/X, B/Y = interactable actions while holding.
