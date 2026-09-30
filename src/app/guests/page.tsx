"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Guest = {
  id: string;
  fullName: string;
  phone: string;
  status: "PENDING" | "VERIFIED" | "FLAGGED" | "CHECKED_IN" | "CHECKED_OUT";
  createdAt: string;
  verifications: { riskLevel: string }[];
};

const statusLabels: Record<Guest["status"], string> = {
  PENDING: "Chờ kiểm tra",
  VERIFIED: "Đã xác minh",
  FLAGGED: "Cảnh báo",
  CHECKED_IN: "Đã nhận phòng",
  CHECKED_OUT: "Đã trả phòng",
};

const statusTone: Record<Guest["status"], string> = {
  PENDING: "bg-neutral-100 text-neutral-600",
  VERIFIED: "bg-green-100 text-green-700",
  FLAGGED: "bg-red-100 text-red-700",
  CHECKED_IN: "bg-blue-100 text-blue-700",
  CHECKED_OUT: "bg-neutral-100 text-neutral-500",
};

export default function GuestsPage() {
  const [guests, setGuests] = useState<Guest[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ fullName: "", phone: "" });

  async function load() {
    setLoading(true);
    const res = await fetch("/api/guests");
    setGuests(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function createGuest(e: React.FormEvent) {
    e.preventDefault();
    if (!form.fullName.trim() || !form.phone.trim()) return;
    await fetch("/api/guests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(form),
    });
    setForm({ fullName: "", phone: "" });
    load();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Khách hàng</h1>

      <form onSubmit={createGuest} className="flex flex-wrap gap-3 rounded-xl border border-neutral-200 bg-white p-4">
        <input
          className="flex-1 min-w-[160px] rounded-md border border-neutral-300 px-3 py-2 text-sm"
          placeholder="Họ tên khách"
          value={form.fullName}
          onChange={(e) => setForm({ ...form, fullName: e.target.value })}
        />
        <input
          className="flex-1 min-w-[160px] rounded-md border border-neutral-300 px-3 py-2 text-sm"
          placeholder="Số điện thoại"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
        />
        <button className="rounded-md bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600">
          Thêm khách
        </button>
      </form>

      {loading ? (
        <p className="text-sm text-neutral-500">Đang tải...</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-neutral-500">
              <tr>
                <th className="px-4 py-2">Tên</th>
                <th className="px-4 py-2">SĐT</th>
                <th className="px-4 py-2">Trạng thái</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {guests.map((g) => (
                <tr key={g.id} className="border-t border-neutral-100">
                  <td className="px-4 py-2 font-medium">{g.fullName}</td>
                  <td className="px-4 py-2">{g.phone}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusTone[g.status]}`}>
                      {statusLabels[g.status]}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Link href={`/guests/${g.id}`} className="text-orange-600 hover:underline">
                      Chi tiết →
                    </Link>
                  </td>
                </tr>
              ))}
              {guests.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-neutral-400">
                    Chưa có khách nào.
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
