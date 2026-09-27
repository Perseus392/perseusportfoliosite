// Registry: the word after "Grab_" in a Unity object's name picks the script.
//   Grab_Example        -> Example.js
//   Grab_ConfettiGun_2  -> ConfettiGun.js   (add a line below + the file)
// Objects whose type isn't listed here are still grabbable, just with no extra behaviour.
export default {
  Example: () => import('./Example.js'),
};
