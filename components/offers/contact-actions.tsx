"use client";

import { useRef, useState } from "react";
import { Copy, MessageCircle, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  slug: string;
  offerUrl: string;
  whatsappUrl: string | null;
  callUrl: string | null;
};
type Channel = "whatsapp" | "call";

export function ContactActions({ slug, offerUrl, whatsappUrl, callUrl }: Props) {
  const lastClick = useRef<Partial<Record<Channel, number>>>({});
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "manual">("idle");

  function track(channel: Channel) {
    const now = Date.now();
    const previous = lastClick.current[channel];
    if (previous !== undefined && now - previous < 3000) return;
    if (typeof crypto.randomUUID !== "function") return;
    lastClick.current[channel] = now;

    void fetch(`/api/offers/${slug}/contact`, {
      method: "POST",
      headers: {
        "X-Contact-Channel": channel,
        "X-Contact-Event": crypto.randomUUID(),
      },
      keepalive: true,
    }).catch(() => {
      // Contact links remain usable when tracking cannot be delivered.
    });
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(offerUrl);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("manual");
    }
  }

  return (
    <section className="mt-5 border-t pt-4" aria-label="Offer actions">
      {(whatsappUrl || callUrl) && (
        <div className="offer-contact-bar">
          {whatsappUrl && (
            <Button asChild>
              <a
                href={whatsappUrl}
                data-analytics-contact="whatsapp"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => track("whatsapp")}
                onAuxClick={(event) => {
                  if (event.button === 1) track("whatsapp");
                }}
              >
                <MessageCircle size={18} aria-hidden="true" /> WhatsApp
              </a>
            </Button>
          )}
          {callUrl && (
            <Button asChild variant={whatsappUrl ? "outline" : "default"}>
              <a data-analytics-contact="call" href={callUrl} onClick={() => track("call")}>
                <Phone size={17} aria-hidden="true" /> Call
              </a>
            </Button>
          )}
        </div>
      )}
      <Button variant="outline" size="sm" onClick={() => void copyLink()}>
        <Copy size={16} aria-hidden="true" /> Copy Link
      </Button>
      <p role="status" className="mt-2 text-sm text-muted-foreground">
        {copyStatus === "copied"
          ? "Offer link copied."
          : copyStatus === "manual"
            ? "Select and copy the offer link below."
            : ""}
      </p>
      {copyStatus === "manual" && (
        <input
          aria-label="Offer link"
          value={offerUrl}
          readOnly
          onFocus={(event) => event.currentTarget.select()}
          className="mt-2 min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
        />
      )}
    </section>
  );
}
