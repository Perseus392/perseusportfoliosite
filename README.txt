PORTFOLIO SITE - quick guide

FILES
  index.html   the 2D page (you don't need to touch it)
  content.js   ALL your text, links, images, videos. Edit this one.
  vr.js        the VR room (cards, grid space)
  gorilla.js   Gorilla Tag locomotion, ported 1:1 from Player.cs
  media/       put your images and short clips here

ADD AN IMAGE / CLIP
  1. Drop the file in media/ (e.g. media/spiral.jpg)
  2. In content.js, inside that project's  media: [ ]  add one of:
       { type: "image", src: "media/spiral.jpg", caption: "Spiral track" },
       { type: "video", src: "media/squish.mp4" },     (short loop, under 5 MB)
       { type: "youtube", id: "BGf_m5LxwDM" },          (the part after watch?v=)

HOST FREE ON GITHUB PAGES
  1. github.com -> New repository named  yourusername.github.io  (Public)
  2. Add file -> Upload files -> drag in everything in this folder -> Commit
  3. Open https://yourusername.github.io  (give it about a minute)
  To edit later: open content.js on GitHub, click the pencil, save.

VR
  Open the site in the Quest browser and an "Enter VR" button appears.
  Move like Gorilla Tag. Right stick = snap turn. Grip button = grab / throw objects.
  Tune the feel at the top of the GorillaPlayer constructor in gorilla.js
  (same names as your Unity inspector values).
