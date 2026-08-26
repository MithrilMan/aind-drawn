# Paper Circuit audio assets

Race sound effects are bundled locally so gameplay never depends on a network request.
The four `engine-ignition-*.opus` files are the four variants generated together from
the ElevenLabs prompt beginning “Compact rally car engine ignition and aggressive
starting rev”. Each racer owns one variant; the race audio runtime derives its
continuous engine timbre from the same source to preserve identity from grid to race.

`engine-loop.opus` is the separately generated steady rally-engine fallback, while
`offroad-loop.opus` provides the gravel/dirt layer. Existing WAV cues retain their
original focused event roles.

`main-song.opus` is the bundled Paper Circuit theme supplied as
`Insert_Coin_to_Ride_2026-08-26T154247.mp3`. It was transcoded from a 192 kbps MP3
to 80 kbps variable-bitrate Opus for looped playback through the independent
`Music` category.
