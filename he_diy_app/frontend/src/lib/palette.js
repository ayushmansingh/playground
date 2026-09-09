/* Colour roles for the charts.

   The categorical slots and the sequential ramp are the validated default
   palette from the data-viz method. The two-slot categorical set (New DIY =
   blue slot 1, Old DIY = orange slot 2) was checked with the palette
   validator against this app's own surfaces — #ffffff light, #171b21 dark —
   on the all-pairs list, and passes every gate in both modes.

   The funnel deliberately does NOT use an eight-step ordinal ramp: eight steps
   inside the legal blue band fail the adjacent-lightness check. Funnel stages
   are one hue on a neutral track instead, with position and length carrying
   the order. */

const LIGHT = {
  series: ["#2a78d6", "#eb6834"],
  /* Sequential blue, light -> dark. The light end recedes toward the surface,
     which is what "near zero" should do on a heatmap. */
  ramp: ["#cde2fb", "#b7d3f6", "#9ec5f4", "#86b6ef", "#5598e7", "#3987e5", "#256abf", "#184f95", "#0d366b"],
};

const DARK = {
  series: ["#3987e5", "#d95926"],
  ramp: ["#12233d", "#16304f", "#184f95", "#1c5cab", "#256abf", "#2a78d6", "#3987e5", "#5598e7", "#86b6ef"],
};

export function isDark() {
  const stamped = document.documentElement.dataset.theme;
  if (stamped === "dark") return true;
  if (stamped === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

const active = () => (isDark() ? DARK : LIGHT);

/* Slot order is fixed: New DIY is always slot 0, Old DIY always slot 1, so a
   filter that hides one never repaints the other. */
export const seriesColor = (index) => active().series[index % active().series.length];

export function rampColor(t) {
  const ramp = active().ramp;
  const clamped = Math.min(Math.max(Number(t) || 0, 0), 1);
  const position = clamped * (ramp.length - 1);
  const low = Math.floor(position);
  const high = Math.min(low + 1, ramp.length - 1);
  return mix(ramp[low], ramp[high], position - low);
}

export const rampStops = () => active().ramp.slice();

function mix(a, b, t) {
  const parse = (hex) => [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
  const [ar, ag, ab] = parse(a);
  const [br, bg, bb] = parse(b);
  const channel = (x, y) => Math.round(x + (y - x) * t).toString(16).padStart(2, "0");
  return `#${channel(ar, br)}${channel(ag, bg)}${channel(ab, bb)}`;
}

/* Text drawn inside a filled cell picks ink or white by the fill's luminance so
   it always clears contrast. */
export function inkOn(hex) {
  const [r, g, b] = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const channel = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  return luminance > 0.45 ? "#0b0b0b" : "#ffffff";
}
