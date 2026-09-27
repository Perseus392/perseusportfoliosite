// ============================================================
//  ALL SITE CONTENT LIVES HERE. Edit this file, nothing else.
//  The 2D page and the VR room both read from it.
//
//  Each card:
//    tag      small label above the title
//    title    card title
//    summary  one or two lines (also shown on the VR card)
//    points   bullet list shown when the card is opened
//    links    [{ label, url }]
//    media    [{ type: "image", src: "media/x.jpg", caption: "" },
//              { type: "video", src: "media/clip.mp4" },   // short loop, <5 MB
//              { type: "youtube", id: "VIDEO_ID" }]       // the part after watch?v=
// ============================================================

window.PORTFOLIO = {
  name: "Christopher Marshall C",
  role: "Spatial Designer · Game Designer · HCI",
  bio: "I simplify complex interaction and game-design problems into intuitive, emotionally resonant experiences that are, above all, fun. Iterative, move-fast-validate-fast, and a strong advocate for data-informed (not data-blind) playtesting. Currently exploring spaces and mechanics for Gorilla Tag-style games.",
  highlight: "DistrictM mechanic publicly praised by Shuhei Yoshida, former President of PlayStation Worldwide Studios.",
  contact: [
    { label: "Email", url: "mailto:you@example.com" },
    { label: "LinkedIn", url: "https://www.linkedin.com/" }
  ],

  cards: [
    {
      tag: "Shipped · Meta Quest",
      title: "DistrictM",
      summary: "A VR third-person rhythm dance platformer where you puppet a skater to the beat.",
      points: [
        "Beat Beacons: the track itself is the timing bar, distance-based timing instead of abstract circles. Distinct shapes per action (jump, drift, steer), colours for handedness and feedback.",
        "Dance Objects: platform objects that unlock dance moves, not traversal puzzles. Spiral tracks make your hands trace circles; Flying Saucers turn a sideways step on the beat into a dash; upside-down tracks flip the jump into a downward flick.",
        "Squish Steers: players steered in short choppy bursts, so holding the grip was rewarded, with hold and release matched to the beat.",
        "Magnets snap the skater to the track centre so players focus only on dancing.",
        "Camera v1: contextual triggers with ease-in/out, using the skater as a crosshair for tunnel vision to prevent nausea.",
        "Problem: movement asymmetry. Players stretched further when the skater was further away, so the same move felt different every time.",
        "Camera v2: always in sync with the skater. Every jump, drift and steer felt the same, level design got faster, the game got more accessible.",
        "Side discovery: when camera zoom-out speed matched skater speed, players felt time slow down.",
        "Game feel: 'Reflection' as the puppetry philosophy, non-tonal SFX experiments, an audio-reactive system; the rhythm reads even with the game muted.",
        "Playtesting: the Body Movement Graph, separating test types, running tests scientifically."
      ],
      links: [{ label: "Meta Store", url: "https://www.meta.com/en-gb/experiences/district-m/3999549193446143/" }],
      media: []
    },
    {
      tag: "Systems design · Cancelled",
      title: "FRUT",
      summary: "Animal Company exploration meets Blox Fruits progression: an anime-pirate social action game for Quest with Gorilla Tag locomotion.",
      points: [
        "Solo design owner of the full design document. Audience: 8–14 year olds.",
        "MVP question: not 'is it fun?' but 'does this hook resonate with 8–14 year olds?', validated by a 30+ minute session loop.",
        "Research: Animal Company runs on intrinsic social fun, Blox Fruits on extrinsic grind. FRUT combines the two.",
        "UG benchmark for social systems: bringing a friend acts like a loot box, with no UI and no economy impact.",
        "Loops: kill → loot → burn for coins → buy (0–2 min); rare fruits, bosses, PVP (2–30 min); skill trees and mastery (30 min+).",
        "Eating is equipping: hold the fruit to your mouth and your hand transforms. Skill wheel on the stick; 'Skill 2 must make Skill 1 or 3 more interesting.'",
        "Stagger bar fills by number of hits, not damage, so any player can contribute to a boss fight.",
        "Soft roles through gadgets (torch, backpack, revive, hookshot) so new players help immediately.",
        "Economy: Berry and Gold, faucets and sinks, reasons to return to base.",
        "Designed for virality: clippable moments every 5–10 minutes, plus a frame-by-frame short-form content playbook.",
        "What I'd test next: session length vs. first-fruit timing, crew return rate, share rate of clips."
      ],
      links: [],
      media: []
    },
    {
      tag: "Shipped · Postmortem",
      title: "Tempo Travelers",
      summary: "High-speed movement game on Quest: 3C design, hub-and-spoke layout, and an honest look at why it didn't land.",
      points: [
        "High-speed movement design: character, camera, controls.",
        "Hub-and-spoke world with points of interest and speed challenges.",
        "Social design borrowed from Animal Company: new players reach the fun instantly through other players.",
        "Why it failed: adopting a new mechanic was hard, gameplay was highly competitive, and players moved too fast to ever meet each other."
      ],
      links: [{ label: "Meta Store", url: "https://www.meta.com/en-gb/experiences/tempo-travelers/9099897866785044/" }],
      media: []
    },
    {
      tag: "Hand tracking",
      title: "Gesture Lab",
      summary: "Hand-tracking prototypes: gestures as spells, weapons and switches.",
      points: [
        "Chakra Thrower (built): index up to summon, swing past a threshold to throw, spin to charge. Fist opens a weapon wheel, thumb swipe selects.",
        "Mustang Snap: a finger snap drives live environment lighting.",
        "Finger Gun.",
        "In progress: hand-sign sequence recognition and a voice + gesture ki blast."
      ],
      links: [],
      media: []
    },
    {
      tag: "Spatial UI",
      title: "XR Widgets & Reality Gizmos",
      summary: "Widgets anchored to your body or your room: wrist metrics, finger rings, a floating metronome, light switches on your walls.",
      points: [
        "Grabbable floating widgets with transparency options, like a home screen anchored in space.",
        "Wrist fitness metrics, finger 'rings', a Hi-Fi Rush style metronome, a floating Pomodoro timer.",
        "Tag spots on your walls as smart-light controls: pinch to toggle, spread thumb and index to open a dial.",
        "Concept: a tabletop finger-skating endless runner built on microgestures."
      ],
      links: [],
      media: []
    },
    {
      tag: "Research",
      title: "Teardowns: Animal Company & UG",
      summary: "What makes social VR games spread: onboarding through other players, K-factor design, folklore.",
      points: [
        "Instant onboarding: other players get newcomers to the fun without tutorials.",
        "UG's K-factor: new players are 'loot boxes' for veterans, so everyone wants to bring friends.",
        "Animal Company's corpse-run hook: the greater the cost, the greater the need to go back.",
        "Folklore design: creatures built on subverted expectations so players retell what happened.",
        "Economy study: faucets and sinks."
      ],
      links: [],
      media: []
    },
    {
      tag: "Video",
      title: "Videos",
      summary: "Gameplay and prototype footage.",
      points: [],
      links: [],
      media: [
        { type: "youtube", id: "BGf_m5LxwDM" },
        { type: "youtube", id: "ztGZloyz8_o" },
        { type: "youtube", id: "VbbvvKXExyY" },
        { type: "youtube", id: "YTmfV4Z_G4w" }
      ]
    }
  ]
};
