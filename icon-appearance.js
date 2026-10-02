(() => {
  "use strict";

  // Share validation and explicit letter colors between the popup and toolbar renderer.
  const DEFAULT = Object.freeze({ color: "#6d28d9", letters: "E", textColor: "#000000" });
  const SIZES = Object.freeze([16, 20, 24, 28, 32]);

  // Accept a hex background, one or two Latin letters, and either white or black text.
  function normalize(value) {
    const color = typeof value?.color === "string" ? value.color.toLowerCase() : "";
    const letters = typeof value?.letters === "string" ? value.letters.trim().toUpperCase() : "";
    const textColor = typeof value?.textColor === "string" ? value.textColor.toLowerCase() : "";
    return {
      color: /^#[0-9a-f]{6}$/.test(color) ? color : DEFAULT.color,
      letters: /^[A-Z]{1,2}$/.test(letters) ? letters : DEFAULT.letters,
      textColor: ["#000000", "#ffffff"].includes(textColor) ? textColor : DEFAULT.textColor,
    };
  }

  // Preserve the existing hand-tuned PNGs when the default appearance is selected.
  function isDefault(value) {
    const appearance = normalize(value);
    return appearance.color === DEFAULT.color && appearance.letters === DEFAULT.letters && appearance.textColor === DEFAULT.textColor;
  }

  // Render each display scale directly instead of stretching a small bitmap.
  function render(value, createCanvas) {
    const appearance = normalize(value);
    const imageData = {};
    for (const size of SIZES) {
      const canvas = createCanvas(size);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Icon drawing is unavailable.");

      // Leave the rounded corners transparent to match the original icon shape.
      context.clearRect(0, 0, size, size);
      context.fillStyle = appearance.color;
      context.beginPath();
      context.roundRect(0, 0, size, size, size * 0.23);
      context.fill();

      // Fit two initials without crowding and center using the actual glyph bounds.
      context.fillStyle = appearance.textColor;
      context.font = `700 ${size * (appearance.letters.length === 2 ? 0.60 : 0.75)}px Arial, sans-serif`;
      context.textAlign = "center";
      context.textBaseline = "alphabetic";
      const metrics = context.measureText(appearance.letters);
      const baseline = size / 2 + (metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2;
      context.fillText(appearance.letters, size / 2, baseline);
      imageData[size] = context.getImageData(0, 0, size, size);
    }
    return imageData;
  }

  // Expose this small shared helper only inside the extension's own contexts.
  globalThis.IconAppearance = Object.freeze({ KEY: "iconAppearance", DEFAULT, SIZES, normalize, isDefault, render });
})();
