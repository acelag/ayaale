import "server-only";

export function offerViewTrackingEnabled() {
  const setting = process.env.OFFER_VIEW_TRACKING;
  return setting === "on" || (setting !== "off" && process.env.APP_ENV === "development");
}
