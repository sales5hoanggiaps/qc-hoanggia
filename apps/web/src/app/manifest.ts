import { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "QC Hoàng Gia - Kiểm soát chất lượng",
    short_name: "QC Hoàng Gia",
    description: "Hệ thống tra cứu tiêu chuẩn sản phẩm & Kiểm soát chất lượng Hoàng Gia PS",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#1D3781",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
