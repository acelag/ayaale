import { pathToFileURL } from "node:url";

// Error messages contain variable names only, never submitted values.
export function validateDeploymentEnv(env) {
  const errors = [];
  if (!["staging", "production"].includes(env.APP_ENV))
    errors.push("APP_ENV must be staging or production");
  const parseOrigin = (name) => {
    try {
      const url = new URL(env[name]);
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        url.pathname !== "/" ||
        url.search ||
        url.hash ||
        url.port
      )
        throw new Error();
      return url;
    } catch {
      errors.push(
        `${name} must be an HTTPS origin without credentials, path, port, query or fragment`,
      );
      return null;
    }
  };
  const site = parseOrigin("NEXT_PUBLIC_SITE_URL");
  if (site && env.APP_ENV === "production" && site.hostname !== "ayaale.com")
    errors.push("Production NEXT_PUBLIC_SITE_URL must use the canonical ayaale.com host");
  if (
    site &&
    env.APP_ENV === "staging" &&
    (site.hostname === "ayaale.com" ||
      site.hostname === "www.ayaale.com" ||
      site.hostname === "localhost" ||
      site.hostname === "127.0.0.1" ||
      site.hostname === "[::1]")
  )
    errors.push("Staging NEXT_PUBLIC_SITE_URL must use its own deployed hostname");
  const supabase = parseOrigin("NEXT_PUBLIC_SUPABASE_URL");
  if (supabase && !/^[a-z0-9]{20}\.supabase\.co$/.test(supabase.hostname))
    errors.push("NEXT_PUBLIC_SUPABASE_URL must use its hosted Supabase project endpoint");
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ""))
    errors.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be a Supabase publishable key");
  for (const [name, value] of Object.entries(env)) {
    if (!name.startsWith("NEXT_PUBLIC_") || !value) continue;
    if (
      /SECRET|SERVICE_ROLE|PASSWORD|PRIVATE|TOKEN/.test(name) ||
      /sb_secret_|service_role/.test(value)
    )
      errors.push(`${name} must not expose a privileged credential`);
    // Legacy JWT API keys are not accepted in this new deployment baseline.
    if (value.startsWith("eyJ")) errors.push(`${name} must not contain a legacy JWT key`);
  }
  return errors;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const errors = validateDeploymentEnv(process.env);
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exitCode = 1;
  } else {
    console.log("Deployment environment checks passed. Values were not logged.");
  }
}
