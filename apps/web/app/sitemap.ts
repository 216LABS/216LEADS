import type { MetadataRoute } from "next";
import { PUBLIC_PAGES, siteUrl } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PAGES.map((p) => ({ url: `${siteUrl()}${p || "/"}`, changeFrequency: p === "/data" ? "daily" : "weekly" }));
}
