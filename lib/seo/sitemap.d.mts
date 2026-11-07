export function sitemapPaths(
  fetchPage: (after: string | null) => Promise<unknown>,
): Promise<string[]>;
export function sitemapXml(paths: string[]): string;
