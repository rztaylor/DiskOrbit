# DiskOrbit brand assets

`branding/diskorbit.png` is the canonical approved J artwork at its original
resolution. `branding/diskorbit-1024.png` is a packaging master derived
directly from it, with only the white area outside the rounded icon converted
to transparency.

Shipping copies and packaging inputs are organised by consumer:

- `frontend/public/` contains a PNG favicon, multi-size ICO fallback, and Apple
  touch icon embedded with the browser frontend;
- `packaging/windows/diskorbit.ico` contains 16–256 px Windows icon entries;
- `packaging/macos/diskorbit.icns` contains the macOS icon family;
- `packaging/linux/hicolor/` contains standard PNG sizes for a future desktop
  entry or application package.

When the mark changes, update the canonical PNG first, render a new 1024 px
RGBA packaging master, regenerate every derived format, and inspect both the
full-size artwork and the 16–48 px exports before committing them.
