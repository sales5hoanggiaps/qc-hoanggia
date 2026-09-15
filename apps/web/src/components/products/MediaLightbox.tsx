"use client";

import { useEffect } from "react";

/** Overlay toàn màn hình hiện 1 ảnh cỡ lớn — dùng chung cho MediaGallery (chế độ xem) và
 * MediaUploader (chế độ sửa) khi bấm vào 1 thumbnail. Đóng bằng: bấm ra ngoài ảnh, nút X, hoặc phím Esc. */
export function MediaLightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions --
          chỉ chặn click nổi bọt lên overlay (để bấm ra ngoài ảnh mới đóng) — phím Esc đã xử lý riêng ở trên. */}
      <img src={src} alt={alt} className="max-h-full max-w-full rounded-lg object-contain" onClick={(e) => e.stopPropagation()} />
      <button
        type="button"
        onClick={onClose}
        aria-label="Đóng"
        className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-5 w-5">
          <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
