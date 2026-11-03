import type { MetadataRoute } from "next";
import { basePath, isProduction } from "@216leads/shared";
import { PRIVATE_PATHS, siteUrl } from "@/lib/site";

// Staging and previews stay out of search; production lists the public pages (issue #70 QA).
export default function robots(): MetadataRoute.Robots {
  if (!isProduction()) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: { userAgent: "*", allow: `${basePath()}/`, disallow: PRIVATE_PATHS.map((p) => `${basePath()}${p}`) },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
