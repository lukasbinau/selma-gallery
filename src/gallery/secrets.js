// Hidden features, one per painting at most. gallery.js creates each with
//   { id, material, aspect, frame, room }   (material: the art plane's own;
//   room: { mats, setMood(dusk, night), loadArt(id, size) })
// and every one answers:
//   tap(hit, { leaned }) → true if the tap was its own (the gallery then does nothing else)
//   update(dt, { slow })   every frame; slow = the visitor prefers reduced motion
//   reset()                the gallery was closed
//   leave?()               the visitor stepped back from the painting
//   sway?                  { amount, time } to rock the camera, or null
// A secret may also take over the gallery for a while (room.takeOver(it)):
// then every tap and Esc goes to its tap(), and it may answer
//   camera(camera)         after the gallery placed the camera: move it on
//   render() → true        it drew the frame itself
import { createTrip } from './trip.js';
import { createSunset } from './sunset.js';
import { createSpread } from './spread.js';
import { createJourney } from './journey.js';

export const SECRETS = {
  'lilla-skyer': createTrip, // tap the red sun: the painting goes psychedelic
  'sol-og-figur': createSunset, // tap the sun: it sets, night falls, it rises
  'blaa-fliser': createSpread, // tap the cross: the pattern covers the walls
  'lille-stjerne': createJourney, // tap the star: through the door, a journey through every painting
};
