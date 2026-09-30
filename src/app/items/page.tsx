"use client";

import { useEffect, useState } from "react";

type Item = {
  id: string;
  name: string;
  category: "FURNITURE" | "GAME" | "PLANT" | "OTHER";
  intervalHours: number;
  notes: string | null;
  lastCaredAt: string | null;
  isDue: boolean;
  dueAt: string | null;
};

const categoryLabels: Record<Item["category"], string> = {
  FURNITURE: "Đồ đạc nhỏ",
  GAME: "Trò chơi (cần refill)",
  PLANT: "Cây (cần tưới)",
  OTHER: "Khác",
};

export default function ItemsPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    name: "",
    category: "PLANT" as Item["category"],
    intervalHours: 48,
    notes: "",
  });

  async function load() {
    setLoading(true);
    const res = await fetch("/api/items");
    setItems(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function createItem(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    await fetch("/api/items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(form),
    });
    setForm({ name: "", category: "PLANT", intervalHours: 48, notes: "" });
    load();
  }

  async function markCared(id: string) {
    await fetch(`/api/items/${id}/care`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    load();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Đồ đạc, trò chơi & cây cảnh</h1>

      <form onSubmit={createItem} className="grid grid-cols-1 gap-3 rounded-xl border border-neutral-200 bg-white p-4 sm:grid-cols-2 md:grid-cols-4">
        <input
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
          placeholder="Tên (VD: Cây trầu bà)"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <select
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
          value={form.category}
          onChange={(e) => setForm({ ...form, category: e.target.value as Item["category"] })}
        >
          {Object.entries(categoryLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <input
          type="number"
          min={1}
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
          placeholder="Chu kỳ (giờ)"
          value={form.intervalHours}
          onChange={(e) => setForm({ ...form, intervalHours: Number(e.target.value) })}
        />
        <button className="rounded-md bg-orange-500 px-3 py-2 text-sm font-medium text-white hover:bg-orange-600">
          Thêm
        </button>
        <input
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm sm:col-span-2 md:col-span-4"
          placeholder="Ghi chú (tuỳ chọn)"
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
        />
      </form>

      {loading ? (
        <p className="text-sm text-neutral-500">Đang tải...</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-neutral-500">
              <tr>
                <th className="px-4 py-2">Tên</th>
                <th className="px-4 py-2">Loại</th>
                <th className="px-4 py-2">Chu kỳ</th>
                <th className="px-4 py-2">Chăm sóc gần nhất</th>
                <th className="px-4 py-2">Trạng thái</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-t border-neutral-100">
                  <td className="px-4 py-2 font-medium">{item.name}</td>
                  <td className="px-4 py-2">{categoryLabels[item.category]}</td>
                  <td className="px-4 py-2">{item.intervalHours}h</td>
                  <td className="px-4 py-2">
                    {item.lastCaredAt ? new Date(item.lastCaredAt).toLocaleString("vi-VN") : "Chưa từng"}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        item.isDue ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"
                      }`}
                    >
                      {item.isDue ? "Cần xử lý" : "Ổn"}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => markCared(item.id)}
                      className="rounded-md border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-50"
                    >
                      Đánh dấu đã xử lý
                    </button>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-neutral-400">
                    Chưa có mục nào. Thêm đồ đạc / trò chơi / cây đầu tiên ở trên.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
