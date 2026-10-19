#!/bin/zsh
# SANDSIAM · Opens the game in Chrome with the music playing straight away.
#
# Browsers keep sound off until the visitor taps the page. This Chrome window
# is started with that rule turned off, so the tune begins as soon as the page
# opens. It uses its own Chrome profile (so the setting always takes effect,
# even when Chrome is already open); players and stickers are remembered there.
#
# Double-click this file in Finder to start the game.

URL="https://puimekstu03-afk.github.io/sandsiam-kids/"
PROFILE="$HOME/Library/Application Support/SANDSIAM Chrome"

open -na "Google Chrome" --args \
  --user-data-dir="$PROFILE" \
  --autoplay-policy=no-user-gesture-required \
  --no-first-run \
  --no-default-browser-check \
  --new-window "$URL"
