"use client";

import { useEffect, useState } from "react";

interface CategoryRow {
  id: string;
  name: string;
}

export function CategoriesPanel() {
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/admin/categories");
    const body = await res.json();
    setCategories(body.categories ?? []);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/admin/categories", { method: "POST", body: JSON.stringify({ name }) });
    if (!res.ok) {
      setError("Không tạo được danh mục — có thể tên đã tồn tại.");
      return;
    }
    setName("");
    await load();
  }

  async function handleDelete(id: string) {
    await fetch(`/api/admin/categories/${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-lg font-semibold">Danh mục phân loại sản phẩm</h1>

      <form onSubmit={handleCreate} className="flex items-end gap-2 rounded border bg-white p-4">
        <div>
          <label className="block text-xs font-medium">Tên danh mục</label>
          <input className="rounded border px-2 py-1" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <button type="submit" className="rounded bg-brand-600 px-4 py-1.5 text-white hover:bg-brand-700">
          Thêm
        </button>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <ul className="divide-y rounded border bg-white">
        {categories.map((c) => (
          <li key={c.id} className="flex items-center justify-between p-2 text-sm">
            {c.name}
            <button onClick={() => handleDelete(c.id)} className="text-red-600 hover:underline">
              Xoá
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
