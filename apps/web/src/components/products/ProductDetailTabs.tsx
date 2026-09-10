"use client";

import { useState } from "react";
import { UserRole } from "@qc/db";
import type { ProductDetail } from "@/lib/products/get-product-detail";
import { TCSPTab } from "./TCSPTab";
import { QCTab } from "./QCTab";
import { PackagingTab } from "./PackagingTab";
import { DocumentsTab } from "./DocumentsTab";
import { HistoryTab } from "./HistoryTab";

const TABS = ["Tiêu chuẩn sản phẩm", "QC sản phẩm", "Quy cách đóng gói", "Giấy tờ sản phẩm", "Lịch sử phiên bản"] as const;
type TabName = (typeof TABS)[number];

export function ProductDetailTabs({ product, role }: { product: ProductDetail; role: UserRole }) {
  const [activeTab, setActiveTab] = useState<TabName>("Tiêu chuẩn sản phẩm");
  const [editing, setEditing] = useState(false);
  const canEdit = role === UserRole.MANAGER || role === UserRole.ADMIN;
  const editableTabs: TabName[] = ["Tiêu chuẩn sản phẩm", "QC sản phẩm", "Quy cách đóng gói"];
  const showEditButton = canEdit && editableTabs.includes(activeTab) && !editing;

  function switchTab(tab: TabName) {
    setActiveTab(tab);
    setEditing(false);
  }

  return (
    <div>
      <div className="flex items-center justify-between border-b">
        <nav className="flex gap-1">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => switchTab(tab)}
              className={`px-3 py-2 text-sm ${activeTab === tab ? "border-b-2 border-brand-600 font-medium" : "text-gray-500"}`}
            >
              {tab}
            </button>
          ))}
        </nav>
        {showEditButton && (
          <button onClick={() => setEditing(true)} className="mb-1 rounded bg-brand-600 px-3 py-1 text-sm text-white hover:bg-brand-700">
            Chỉnh sửa
          </button>
        )}
      </div>
      <div className="py-4">
        {activeTab === "Tiêu chuẩn sản phẩm" && (
          <TCSPTab product={product} editing={editing && activeTab === "Tiêu chuẩn sản phẩm"} onDoneEditing={() => setEditing(false)} />
        )}
        {activeTab === "QC sản phẩm" && (
          <QCTab product={product} editing={editing && activeTab === "QC sản phẩm"} onDoneEditing={() => setEditing(false)} />
        )}
        {activeTab === "Quy cách đóng gói" && (
          <PackagingTab product={product} editing={editing && activeTab === "Quy cách đóng gói"} onDoneEditing={() => setEditing(false)} />
        )}
        {activeTab === "Giấy tờ sản phẩm" && <DocumentsTab product={product} />}
        {activeTab === "Lịch sử phiên bản" && <HistoryTab product={product} />}
      </div>
    </div>
  );
}
