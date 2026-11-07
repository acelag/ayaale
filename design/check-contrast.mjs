// Run: node design/check-contrast.mjs
// Checks specified solid-color pairs only; browser states still need manual QA.
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const css = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");
const colors = Object.fromEntries(
  [...css.matchAll(/--([\w-]+):\s*(#[\da-f]{6});/gi)].map(([, name, hex]) => [name, hex]),
);
function luminance(hex) {
  const channels = hex
    .slice(1)
    .match(/../g)
    .map((value) => parseInt(value, 16) / 255)
    .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
const pairs = [
  ["foreground", "background", 4.5],
  ["card-foreground", "card", 4.5],
  ["popover-foreground", "popover", 4.5],
  ["primary-foreground", "primary", 4.5],
  ["primary-foreground", "primary-hover", 4.5],
  ["secondary-foreground", "secondary", 4.5],
  ["muted-foreground", "background", 4.5],
  ["muted-foreground", "card", 4.5],
  ["muted-foreground", "muted", 4.5],
  ["accent-foreground", "accent", 4.5],
  ["destructive-foreground", "destructive", 4.5],
  ["destructive", "card", 4.5],
  ["success", "success-background", 4.5],
  ["warning", "warning-background", 4.5],
  ["disabled-foreground", "disabled-background", 4.5],
  ["primary", "background", 4.5],
  ["input", "card", 3],
  ["input", "background", 3],
  ["ring", "card", 3],
  ["ring", "background", 3],
];
for (const [foreground, background, minimum] of pairs) {
  assert.ok(colors[foreground] && colors[background], `Missing color: ${foreground}/${background}`);
  const values = [luminance(colors[foreground]), luminance(colors[background])].sort(
    (a, b) => b - a,
  );
  const ratio = (values[0] + 0.05) / (values[1] + 0.05);
  assert.ok(ratio >= minimum, `${foreground}/${background}: ${ratio.toFixed(2)} < ${minimum}`);
  console.log(`PASS ${foreground}/${background}: ${ratio.toFixed(2)}:1 (minimum ${minimum}:1)`);
}
console.log(`${pairs.length} contrast pairs passed.`);
