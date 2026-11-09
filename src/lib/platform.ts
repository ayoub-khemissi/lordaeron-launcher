// The launcher runs on Windows and on a Mac. On a Mac the game is the Windows client run through CrossOver, Whisky or
// Wine: Lumenveil (Direct3D 9, Windows) and the automatic login are not offered there.
export const isMac = typeof navigator !== "undefined" && /Macintosh|Mac OS X/.test(navigator.userAgent);
