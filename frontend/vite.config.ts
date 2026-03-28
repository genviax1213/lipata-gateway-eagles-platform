import { defineConfig, type PluginOption, type UserConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { buildHomepageFallback } from "./scripts/build-homepage-fallback";
import { buildPublicPostPrerender } from "./scripts/build-public-post-prerender";
import { buildPublicSectionPrerender } from "./scripts/build-public-section-prerender";

export default defineConfig(async (): Promise<UserConfig> => {
  const homepageFallback = await buildHomepageFallback(process.env);
  const plugins: PluginOption[] = [
    react(),
    tailwindcss(),
    {
      name: "inject-homepage-fallback",
      transformIndexHtml(html: string) {
        return html
          .replaceAll("__HOMEPAGE_META_TITLE__", homepageFallback.title)
          .replaceAll("__HOMEPAGE_META_DESCRIPTION__", homepageFallback.description)
          .replaceAll("__HOMEPAGE_META_IMAGE__", homepageFallback.image)
          .replaceAll("__HOMEPAGE_META_IMAGE_ALT__", homepageFallback.imageAlt)
          .replace("<!-- HOMEPAGE_FALLBACK_CONTENT -->", homepageFallback.bodyHtml)
          .replace("<!-- HOMEPAGE_PRERENDER_DATA -->", homepageFallback.payloadScript);
      },
    },
    {
      name: "generate-public-post-prerender",
      apply: "build",
      async closeBundle() {
        await buildPublicPostPrerender(process.env);
        await buildPublicSectionPrerender(process.env);
      },
    },
  ];

  return {
    build: {
      cssCodeSplit: false,
      rollupOptions: {
        output: {
          inlineDynamicImports: true,
        },
      },
    },
    plugins,
  };
});
