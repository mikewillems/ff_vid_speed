# Firefox Video Speed Controller

This is an extension for Firefox that provides a small speed controller only on the sites you specifically choose. This is by far the most intuitive / useful command set I've seen for these, and I wanted one where the source is readily available and easy to understand.

Importantly, it's also the only video speed controller I've ever seen that implements a variable-speed "breathe" mode which moves the speed up and down so you can watch speech at much faster average rates without losing track.

Youtube started trying to charge for this as a way to upsell their subscription (lolwut, they can go eat dirt). This works for any primarily HTML5 based site, and also works for HTML5 audio (e.g. podcasts), though streaming music is normally not implemented as HTML5.

This is the same functionality as in my [greasemonkey_video_speed script](https://github.com/mikewillems/greasemonkey_video_speed/blob/main/README.md) but implemented as an extension without the need for the overhead and security exposure of greasemonkey/firemonkey.

## Controls

Format is:

[keystroke] ("[button label]") = [function]

- S ("<<") = big step slower (-1x if current speed is >1x, else half the current speed, down to 0.125x minimum)
- s ("<") = small step slower (-0.1x down to 0.1x minimum)
- o ([the current speed]) = reset to 1.0x speed
- d (">") = small step faster (+0.1x up to 8x maximum)
- D (">>") = big step faster (+1x if current speed is >1x, else double the current speed, up to 8x maximum)

- v (no button) = toggle variable-speed ("breathe") mode on and off 

When switching between geometric ("S" and "D") to decimal ("s" and "d") increment sets, the speed snaps to the closest value of the new increment set that is still in the right speed direction (slower or faster).

Variable speed mode varies the playback between the current setting and 2x speed, allowing you to watch much faster average video speeds while giving your brain time to catch up and maintaining retention better even than watching on just 2x speed. I don't know fully why this works, but I've been doing it for years, and my suspicion is that it prevents your getting bored by a monotone consistent rhythm and then thinking of speech as background. 

Add or remove sites as desired from the front matter, or change the breathing intervals to be more to your liking.
