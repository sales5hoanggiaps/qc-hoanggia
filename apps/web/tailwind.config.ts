import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      colors: {
        // Màu chủ đạo thật của Hoàng Gia (#1D3781, đo trực tiếp từ file logo chính thức tại
        // hoanggiaps.com/wp-content/uploads/2026/04/Logo-Hoang-Gia-PS.webp — không phải đoán) —
        // dùng cho mọi hành động chính (nút, link, viền focus, sidebar).
        brand: {
          50: "#eef1fb",
          100: "#dce2f5",
          200: "#b9c5eb",
          300: "#8fa0dc",
          400: "#5d74c4",
          500: "#3a54a8",
          600: "#1d3781",
          700: "#172c69",
          800: "#122151",
          900: "#0d1839",
        },
        // Đỏ nhấn phụ trên hoanggiaps.com (#EC1A39, đo từ CTA/trạng thái active trên site) —
        // CHỈ dùng cho vài điểm nhấn thương hiệu có chủ đích (vd chỉ báo tab đang chọn), KHÔNG
        // dùng cho lỗi/xoá (những chỗ đó vẫn dùng đỏ Tailwind mặc định — 2 ý nghĩa tách biệt,
        // tránh người dùng hiểu nhầm "màu thương hiệu" thành "cảnh báo").
        accent: {
          50: "#fef1f2",
          100: "#fee2e5",
          400: "#f4536d",
          500: "#ec1a39",
          600: "#d4132f",
          700: "#b00f27",
        },
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(0 0 0 / 0.04), 0 1px 3px 0 rgb(0 0 0 / 0.06)",
      },
    },
  },
  plugins: [],
};

export default config;
