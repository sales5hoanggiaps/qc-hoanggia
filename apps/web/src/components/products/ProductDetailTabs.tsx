"use client";

import { useEffect, useRef, useState } from "react";
import { UserRole } from "@qc/db";
import type { ProductDetail } from "@/lib/products/get-product-detail";
import { TCSPTab } from "./TCSPTab";
import { QCTab } from "./QCTab";
import { PackagingTab } from "./PackagingTab";
import { DocumentsTab } from "./DocumentsTab";
import { HistoryTab } from "./HistoryTab";

const TABS = ["Tiêu chuẩn sản phẩm", "QC sản phẩm", "Quy cách đóng gói", "Giấy tờ sản phẩm", "Lịch sử phiên bản"] as const;
type TabName = (typeof TABS)[number];

export function ProductDetailTabs({
  product,
  role,
  mediaUrls,
  categories = [],
}: {
  product: ProductDetail;
  role: UserRole;
  mediaUrls: Record<string, string>;
  categories?: { id: string; name: string }[];
}) {
  const [activeTab, setActiveTab] = useState<TabName>("Tiêu chuẩn sản phẩm");
  const [editing, setEditing] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const canEdit = role === UserRole.MANAGER || role === UserRole.ADMIN;
  const editableTabs: TabName[] = ["Tiêu chuẩn sản phẩm", "QC sản phẩm", "Quy cách đóng gói", "Giấy tờ sản phẩm"];
  const showEditButton = canEdit && editableTabs.includes(activeTab) && !editing;

  // Thông báo "Đã lưu thành công" tự ẩn sau vài giây — dọn timeout khi component unmount hoặc
  // khi có 1 lần lưu mới đè lên (tránh setState sau khi đã unmount).
  useEffect(() => {
    if (!savedMessage) return;
    const id = setTimeout(() => setSavedMessage(null), 3000);
    return () => clearTimeout(id);
  }, [savedMessage]);

  function switchTab(tab: TabName) {
    setActiveTab(tab);
    setEditing(false);
    setSavedMessage(null);
  }

  function handleTabKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | null = null;
    if (e.key === "ArrowRight") nextIndex = (index + 1) % TABS.length;
    else if (e.key === "ArrowLeft") nextIndex = (index - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") nextIndex = 0;
    else if (e.key === "End") nextIndex = TABS.length - 1;
    if (nextIndex === null) return;
    e.preventDefault();
    switchTab(TABS[nextIndex]);
    tabRefs.current[nextIndex]?.focus();
  }

  return (
    <div>
      <div className="flex items-center justify-between border-b border-gray-200">
        <nav className="flex gap-1" role="tablist" aria-label="Nội dung mã hàng">
          {TABS.map((tab, i) => (
            <button
              key={tab}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              role="tab"
              id={`tab-${i}`}
              aria-selected={activeTab === tab}
              aria-controls={`tabpanel-${i}`}
              tabIndex={activeTab === tab ? 0 : -1}
              onClick={() => switchTab(tab)}
              onKeyDown={(e) => handleTabKeyDown(e, i)}
              className={`-mb-px px-3 py-2 text-sm transition-colors ${
                activeTab === tab ? "border-b-2 border-brand-600 font-medium text-brand-700" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab}
            </button>
          ))}
        </nav>
        {showEditButton && (
          <button onClick={() => setEditing(true)} className="mb-1 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700">
            Chỉnh sửa
          </button>
        )}
      </div>
      <div className="py-4" role="tabpanel" id={`tabpanel-${TABS.indexOf(activeTab)}`} aria-labelledby={`tab-${TABS.indexOf(activeTab)}`}>
        {savedMessage && (
          <div className="mb-3 rounded bg-green-50 px-3 py-2 text-sm text-green-700">{savedMessage}</div>
        )}
        {activeTab === "Tiêu chuẩn sản phẩm" && (
          <TCSPTab
            product={product}
            editing={editing && activeTab === "Tiêu chuẩn sản phẩm"}
            onDoneEditing={() => setEditing(false)}
            onSaved={() => setSavedMessage("Đã lưu thành công")}
            mediaUrls={mediaUrls}
            categories={categories}
          />
        )}
        {activeTab === "QC sản phẩm" && (
          <QCTab
            product={product}
            editing={editing && activeTab === "QC sản phẩm"}
            onDoneEditing={() => setEditing(false)}
            onSaved={() => setSavedMessage("Đã lưu thành công")}
            mediaUrls={mediaUrls}
          />
        )}
        {activeTab === "Quy cách đóng gói" && (
          <PackagingTab
            product={product}
            editing={editing && activeTab === "Quy cách đóng gói"}
            onDoneEditing={() => setEditing(false)}
            onSaved={() => setSavedMessage("Đã lưu thành công")}
            mediaUrls={mediaUrls}
          />
        )}
        {activeTab === "Giấy tờ sản phẩm" && (
          <DocumentsTab product={product} editing={editing && activeTab === "Giấy tờ sản phẩm"} onDoneEditing={() => setEditing(false)} mediaUrls={mediaUrls} />
        )}
        {activeTab === "Lịch sử phiên bản" && <HistoryTab product={product} role={role} />}
      </div>
    </div>
  );
}
