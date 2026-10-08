(() => {
  "use strict";

  // Share the saved shape and color between settings and every favorite location.
  const DEFAULT = Object.freeze({ color: "#6d28d9", matchIcon: false, shape: "star" });
  const SHAPES = new Set(["star", "circle", "bear"]);
  const KEY = "favoriteAppearance";
  const ICON_KEY = "iconAppearance";
  const CSS_PROPERTY = "--ellucian-favorite-color";

  // Accept only a local hex color and an explicit match-icon preference.
  function normalize(value) {
    const color = typeof value?.color === "string" ? value.color.toLowerCase() : "";
    return {
      color: /^#[0-9a-f]{6}$/.test(color) ? color : DEFAULT.color,
      matchIcon: value?.matchIcon === true,
      shape: SHAPES.has(value?.shape) ? value.shape : DEFAULT.shape,
    };
  }

  // Follow the icon background when linked, retaining the independent color for later.
  function resolve(value, icon) {
    const appearance = normalize(value);
    return appearance.matchIcon ? normalize({ color: icon?.color }).color : appearance.color;
  }

  // Draw only the selected small vector; never load a library or external artwork.
  let faceSequence = 0;
  const facePrefix = `ellucian-favorite-face-${Math.random().toString(36).slice(2)}`;
  const faceOutline = 'M20.69 9.67a4.5 4.5 0 1 0-7.04-5.5 8.35 8.35 0 0 0-3.3 0 4.5 4.5 0 1 0-7.04 5.5C2.49 11.2 2 12.88 2 14.5 2 19.47 6.48 22 12 22s10-2.53 10-7.5c0-1.62-.48-3.3-1.3-4.83';
  const faceDetails = '<path d="M11.25 17.25h1.5L12 18z"/><path d="m15 12 2 2"/><path d="M18 6.5a.5.5 0 0 0-.5-.5"/><path d="M6 6.5a.495.495 0 0 1 .5-.5"/><path d="m9 12-2 2"/>';

  /* Bear face adapted from Lucide's panda icon. ISC License.
   * Copyright (c) 2026 Lucide Icons and Contributors
   * Permission to use, copy, modify, and/or distribute this software for any
   * purpose with or without fee is hereby granted, provided that the above
   * copyright notice and this permission notice appear in all copies.
   * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
   * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
   * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
   * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
   * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
   * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
   * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
   */
  function render(icon, value) {
    const shape = normalize(value).shape;
    if (icon.getAttribute('data-favorite-shape') === shape) return;
    icon.setAttribute('data-favorite-shape', shape);
    if (shape === 'bear') {
      // Cut out facial details so any selected color works on any page background.
      const id = `${facePrefix}-${++faceSequence}`;
      icon.innerHTML = `<defs><mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24"><path d="${faceOutline}" fill="white" stroke="white"/><g fill="none" stroke="black" stroke-width="2" stroke-linecap="round">${faceDetails}</g></mask></defs><path d="${faceOutline}" mask="url(#${id})"/><g class="ellucian-favorite-face-details" fill="none" stroke-linecap="round">${faceDetails}</g>`;
    } else {
      // Keep the original star unchanged; a circle uses the same outline/filled behavior.
      icon.innerHTML = shape === 'circle' ? '<circle cx="12" cy="12" r="8"/>'
        : '<path d="M12 3.4l2.66 5.39 5.95.86-4.3 4.2 1.02 5.92L12 16.97l-5.32 2.8 1.01-5.92-4.3-4.2 5.95-.86L12 3.4z"/>';
    }
  }

  // Change color through inheritance; update only icons when their shape actually changes.
  function apply(value, icon, root) {
    root.style.setProperty(CSS_PROPERTY, resolve(value, icon));
    const shape = normalize(value).shape;
    if (root.getAttribute('data-ellucian-favorite-shape') === shape) return;
    root.setAttribute('data-ellucian-favorite-shape', shape);
    root.ownerDocument.querySelectorAll('.ellucian-favorite-star-icon').forEach((element) => render(element, { shape }));
  }

  globalThis.FavoriteAppearance = Object.freeze({ KEY, ICON_KEY, CSS_PROPERTY, DEFAULT, normalize, resolve, render, apply });
})();
