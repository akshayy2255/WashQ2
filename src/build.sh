#!/bin/sh
# Rebuild ../index.html from sources
cd "$(dirname "$0")" && python3 -c "
s=open('app.src.html').read()
s=s.replace('/*CSS*/',open('base.css').read()+open('extra.css').read()+open('theme.css').read()+open('fixes.css').read()+open('unlock.css').read()+open('polish.css').read()+open('fixes2.css').read()+open('fixes3.css').read()).replace('/*FEATURES_JS*/',open('features.js').read()).replace('/*UNLOCK_JS*/',open('unlock.js').read()+open('quickscan.js').read()+open('account.js').read()).replace('/*QRLIB*/',open('qrlib.js').read())
open('../index.html','w').write(s)"
