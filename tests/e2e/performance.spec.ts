import { devices, expect, test } from "@playwright/test";

type Metrics = {
  lcp: number;
  cls: number;
  longTaskBlocking: number;
  ttfb: number;
  transferred: number;
};
for (const path of ["/", "/offers/fixture-coast-1", "/properties/fixture-coast-house"]) {
  test(`cold browser mobile lab budget: ${path}`, async ({ browser }, info) => {
    const samples: Metrics[] = [];
    for (let run = 0; run < 3; run++) {
      const context = await browser.newContext({
        ...devices["Pixel 7"],
      });
      try {
        const page = await context.newPage();
        const session = await context.newCDPSession(page);
        await session.send("Network.enable");
        await session.send("Network.setCacheDisabled", { cacheDisabled: true });
        await session.send("Network.emulateNetworkConditions", {
          offline: false,
          latency: 150,
          downloadThroughput: 1_600_000 / 8,
          uploadThroughput: 750_000 / 8,
        });
        await session.send("Emulation.setCPUThrottlingRate", { rate: 4 });
        await page.addInitScript(() => {
          const metrics = { lcp: 0, cls: 0, longTaskBlocking: 0 };
          Object.assign(window, { ayaaleLab: metrics });
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) metrics.lcp = entry.startTime;
          }).observe({ type: "largest-contentful-paint", buffered: true });
          let sessionStart = 0,
            sessionValue = 0,
            previous = 0;
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries() as (PerformanceEntry & {
              hadRecentInput: boolean;
              value: number;
            })[]) {
              if (entry.hadRecentInput) continue;
              if (entry.startTime - previous < 1000 && entry.startTime - sessionStart < 5000)
                sessionValue += entry.value;
              else {
                sessionStart = entry.startTime;
                sessionValue = entry.value;
              }
              previous = entry.startTime;
              metrics.cls = Math.max(metrics.cls, sessionValue);
            }
          }).observe({ type: "layout-shift", buffered: true });
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries())
              metrics.longTaskBlocking += Math.max(0, entry.duration - 50);
          }).observe({ type: "longtask", buffered: true });
        });
        const response = await page.goto(`http://127.0.0.1:3100${path}`, {
          waitUntil: "networkidle",
        });
        expect(response?.status()).toBe(200);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await expect
          .poll(() =>
            page.evaluate(
              () => (window as unknown as Window & { ayaaleLab: Metrics }).ayaaleLab.lcp,
            ),
          )
          .toBeGreaterThan(0);
        samples.push(
          await page.evaluate(() => {
            const navigation = performance.getEntriesByType(
              "navigation",
            )[0] as PerformanceNavigationTiming;
            return {
              ...(window as unknown as Window & { ayaaleLab: Metrics }).ayaaleLab,
              ttfb: navigation.responseStart - navigation.startTime,
              transferred: performance
                .getEntriesByType("resource")
                .reduce(
                  (total, item) => total + (item as PerformanceResourceTiming).transferSize,
                  navigation.transferSize,
                ),
            };
          }),
        );
      } finally {
        await context.close();
      }
    }
    await info.attach("mobile-lab-samples", {
      body: JSON.stringify(
        { path, cpuSlowdown: 4, latencyMs: 150, downloadKbps: 1600, samples },
        null,
        2,
      ),
      contentType: "application/json",
    });
    const median = (key: keyof Metrics) =>
      samples.map((sample) => sample[key]).sort((a, b) => a - b)[1];
    console.log(
      JSON.stringify({
        path,
        median: {
          lcp: median("lcp"),
          cls: median("cls"),
          longTaskBlocking: median("longTaskBlocking"),
          ttfb: median("ttfb"),
          transferred: median("transferred"),
        },
      }),
    );
    expect(median("lcp"), "mobile lab LCP median (ms)").toBeLessThan(2500);
    expect(median("cls"), "navigation-window CLS median").toBeLessThanOrEqual(0.1);
  });
}
