export function VersionBanner({
  version,
}: {
  version: { baseCode: string; versionNumber: number; amisProductId: string; isCurrent: boolean };
}) {
  return (
    <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
      Đang xem <strong>{version.baseCode}.{version.versionNumber}</strong> (mã AMIS gốc:{" "}
      <code>{version.amisProductId}</code>)
      {!version.isCurrent && <span className="ml-2 font-semibold">— PHIÊN BẢN CŨ, CHỈ ĐỌC</span>}
    </div>
  );
}
