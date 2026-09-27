#!/bin/sh
# Rebuild ../index.html from sources
cd "$(dirname "$0")" && python3 -c "
s=open('app.src.html').read()
s=s.replace('/*CSS*/',open('base.css').read()+open('extra.css').read()+open('theme.css').read()).replace('/*QRLIB*/',open('qrlib.js').read())
open('../index.html','w').write(s)"
