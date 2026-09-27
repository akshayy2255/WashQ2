# Third-party libraries

| File | Library | Version | License | Used for |
|---|---|---|---|---|
| `jsqr.min.js` | [jsQR](https://github.com/cozmo/jsQR) | 1.4.0 | Apache-2.0 | Decoding QR codes from the camera in the Scan Machine QR screen (fallback when the browser has no built-in `BarcodeDetector`, e.g. iPhone Safari) |

`jsqr.min.js` is `dist/jsQR.js` from the npm package `jsqr@1.4.0`, minified with terser. It is loaded only when needed, when the scanner opens.

The QR *generator* used on the Machine Setup page (qrcode-generator 1.4.4, MIT, by Kazuhiko Arase) is inlined into `index.html` from `src/qrlib.js`.
