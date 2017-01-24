#!/bin/bash
cat edit_warning.txt > xdelta3_decoder.js
grep -v '// DEBUG ONLY' xdelta3_decoder_with_debug.js >> xdelta3_decoder.js
