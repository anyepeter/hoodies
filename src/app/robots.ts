import type { MetadataRoute } from "next";

// Design preview only: no search engine should crawl it (the real store is akatsukizipup.com).
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", disallow: "/" }] };
}
