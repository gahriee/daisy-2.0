import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Daisy Property Manager",
    short_name: "Daisy",
    description:
      "Single-Owner boarding house and transient room management workspace.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f7f7",
    theme_color: "#ff385c",
    icons: [
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

