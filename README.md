# undmg.github.io

My portfolio, *Issue 04: Memory Card*. It looks like a brutalist print magazine
mixed with an early-2000s console system menu: an exposed 12-column grid, heavy
rules and condensed headlines on paper pages, and dark "system" screens with
floating memory-block towers, controller-button prompts and spinning save icons.

- `index.html`: the page. Cover → About → Memory card index → three feature
  spreads (Blokd!, Goldngine, Pistonart) → four shorter reads → Contact
- `css/style.css`: all styles (tokens at the top, one section per part of the page)
- `js/main.js`: boot screen, console-menu sounds (Web Audio, on by default,
  toggle in the top bar), a custom cursor that labels what you're pointing at,
  the tower field on the cover (2D canvas), the ASCII portrait renderer,
  scroll reveals, current-section nav, and copy-to-clipboard
- `js/portrait-data.js`: the portrait as ASCII characters + colours (no photo is published)
- `img/`: project screenshots

No build step: it's plain HTML, CSS and JavaScript served by GitHub Pages.
Fonts: Archivo, Instrument Serif and JetBrains Mono from Google Fonts.
