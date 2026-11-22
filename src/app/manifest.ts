import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Daisy Property Manager",
    short_name: "Daisy",
    description:
      "Manage boarding house rooms, tenants, short stays, bills, and payments.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f7f7f7",
    theme_color: "#e00b41",
    icons: [
      {
        src: "/brand/daisy-icon-light.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
      {
        src: "/brand/daisy-icon-light.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
