export function sendWithResend(input: {
  apiKey: string;
  body: string;
  key: string;
  fetcher?: typeof fetch;
}): Promise<{
  outcome: "sent" | "retry" | "failed";
  error_code: string | null;
  provider_id: string | null;
}>;
