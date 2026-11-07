import { createHmac } from "node:crypto";
/** @param {string} secret @param {string} action @param {string} subject */
export function budgetKey(secret, action, subject) {
  if (secret.length < 24) throw new Error("Security configuration is unavailable");
  return createHmac("sha256", secret)
    .update(JSON.stringify(["ayaale-request-budget-v1", action, subject.trim().toLowerCase()]))
    .digest("hex");
}
let imageSlots = 0;
export function acquireImageSlot() {
  if (imageSlots >= 2) return null;
  imageSlots++;
  let released = false;
  return () => {
    if (!released) {
      released = true;
      imageSlots--;
    }
  };
}
