interface MediaItem {
  id: string;
  mimeType: string;
  caption: string | null;
}

export function MediaGallery({ media, mediaUrls }: { media: MediaItem[]; mediaUrls: Record<string, string> }) {
  if (media.length === 0) return <p className="text-gray-400">Chưa có ảnh/video</p>;
  return (
    <div className="grid grid-cols-4 gap-2">
      {media.map((m) => (
        <div key={m.id} className="rounded-lg border border-gray-200 p-2 text-xs">
          {m.mimeType.startsWith("video/") ? (
            <video src={mediaUrls[m.id]} controls className="h-20 w-full rounded-md object-cover" />
          ) : (
            <img src={mediaUrls[m.id]} alt={m.caption ?? ""} className="h-20 w-full rounded-md object-cover" />
          )}
          {m.caption && <p className="mt-1 text-gray-600">{m.caption}</p>}
        </div>
      ))}
    </div>
  );
}
