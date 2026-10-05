(() => {
  "use strict";

  // Share the saved star-color rules between settings and the Experience page.
  const DEFAULT = Object.freeze({ color: "#6d28d9", matchIcon: false });
  const KEY = "favoriteAppearance";
  const ICON_KEY = "iconAppearance";
  const CSS_PROPERTY = "--ellucian-favorite-color";

  // Accept only a local hex color and an explicit match-icon preference.
  function normalize(value) {
    const color = typeof value?.color === "string" ? value.color.toLowerCase() : "";
    return {
      color: /^#[0-9a-f]{6}$/.test(color) ? color : DEFAULT.color,
      matchIcon: value?.matchIcon === true,
    };
  }

  // Follow the icon background when linked, retaining the independent color for later.
  function resolve(value, icon) {
    const appearance = normalize(value);
    return appearance.matchIcon ? normalize({ color: icon?.color }).color : appearance.color;
  }

  // Change one inherited variable rather than redrawing every favorite or pipeline row.
  function apply(value, icon, root) {
    root.style.setProperty(CSS_PROPERTY, resolve(value, icon));
  }

  globalThis.FavoriteAppearance = Object.freeze({ KEY, ICON_KEY, CSS_PROPERTY, DEFAULT, normalize, resolve, apply });
})();
