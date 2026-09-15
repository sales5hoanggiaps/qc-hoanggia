"use client";

import { useState } from "react";
import { MediaLightbox } from "./MediaLightbox";

interface MediaItem {
  id: string;
  mimeType: string;
  caption: string | null;
}

export function MediaGallery({ media, mediaUrls }: { media: MediaItem[]; mediaUrls: Record<string, string> }) {
  const [openId, setOpenId] = useState<string | null>(null);
  if (media.length === 0) return <p className="text-gray-400">Chưa có ảnh/video</p>;
  const openItem = media.find((m) => m.id === openId && !m.mimeType.startsWith("video/"));

  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        {media.map((m) => (
          <div key={m.id} className="rounded-lg border border-gray-200 p-2 text-xs">
            {m.mimeType.startsWith("video/") ? (
              // Video đã có sẵn nút toàn màn hình riêng trong controls trình duyệt — không cần lightbox.
              <video src={mediaUrls[m.id]} controls className="h-40 w-full rounded-md bg-gray-50 object-contain" />
            ) : (
              <button type="button" onClick={() => setOpenId(m.id)} className="block w-full cursor-zoom-in">
                {/* object-contain (không phải cover) — ảnh thật đôi khi có viền trắng lớn quanh nội
                    dung (chụp/scan để lề rộng); cover sẽ cắt giữa và có thể cắt trúng đúng phần
                    trắng đó, làm ảnh trông như trống dù đã tải lên thành công. */}
                <img src={mediaUrls[m.id]} alt={m.caption ?? ""} className="h-40 w-full rounded-md bg-gray-50 object-contain" />
              </button>
            )}
            {m.caption && <p className="mt-1 text-gray-600">{m.caption}</p>}
          </div>
        ))}
      </div>
      {openItem && <MediaLightbox src={mediaUrls[openItem.id]} alt={openItem.caption ?? ""} onClose={() => setOpenId(null)} />}
    </>
  );
}
