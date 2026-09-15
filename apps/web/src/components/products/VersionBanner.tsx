export function VersionBanner({
  version,
}: {
  version: { baseCode: string; versionNumber: number; amisProductId: string; isCurrent: boolean };
}) {
  // amisProductId lưu trong DB có tiền tố "code:" (workaround kỹ thuật khi dòng hàng này AMIS
  // không trả id số tin cậy được — xem run-sync.ts) — bỏ tiền tố đó khi hiển thị, và bỏ luôn nhãn
  // "<baseCode>.<versionNumber>" nội bộ (gây nhầm vì baseCode chính nó có thể đã chứa dấu chấm,
  // vd "AA01.00073.2", cộng thêm ".1" trông như 1 mã khác hẳn) — chỉ hiện đúng mã AMIS gốc.
  const displayCode = version.amisProductId.replace(/^code:/, "");
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
      Mã AMIS gốc: <code className="font-semibold">{displayCode}</code>
      {!version.isCurrent && <span className="ml-2 font-semibold">— PHIÊN BẢN CŨ, CHỈ ĐỌC</span>}
    </div>
  );
}
