import "server-only";

// Manual practice mode cannot be enabled on a hosted deployment by a flag alone.
export function localDemoEnabled() {
  return (
    process.env.AYAALE_LOCAL_DEMO === "1" &&
    process.env.APP_ENV === "development" &&
    process.env.NEXT_PUBLIC_SITE_URL === "http://127.0.0.1:3200" &&
    process.env.NEXT_PUBLIC_SUPABASE_URL === "http://127.0.0.1:3101"
  );
}
