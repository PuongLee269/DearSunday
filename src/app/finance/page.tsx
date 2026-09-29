"use client";

import { useEffect, useState } from "react";

type Transaction = {
  id: string;
  type: "INCOME" | "EXPENSE";
  category: string;
  amount: number;
  description: string | null;
  occurredAt: string;
  guest?: { fullName: string } | null;
};

export default function FinancePage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [summary, setSummary] = useState({ totalIncome: 0, totalExpense: 0, balance: 0 });
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    type: "INCOME" as Transaction["type"],
    category: "",
    amount: 0,
    description: "",
  });

  async function load() {
    setLoading(true);
    const res = await fetch("/api/transactions");
    const data = await res.json();
    setTransactions(data.transactions);
    setSummary(data.summary);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function createTx(e: React.FormEvent) {
    e.preventDefault();
    if (!form.category.trim() || form.amount <= 0) return;
    await fetch("/api/transactions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(form),
    });
    setForm({ type: "INCOME", category: "", amount: 0, description: "" });
    load();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Quản lý tài chính</h1>

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl bg-green-50 p-4 text-green-700">
          <p className="text-sm">Tổng thu</p>
          <p className="text-xl font-bold">{summary.totalIncome.toLocaleString("vi-VN")}đ</p>
        </div>
        <div className="rounded-xl bg-red-50 p-4 text-red-700">
          <p className="text-sm">Tổng chi</p>
          <p className="text-xl font-bold">{summary.totalExpense.toLocaleString("vi-VN")}đ</p>
        </div>
        <div className="rounded-xl bg-blue-50 p-4 text-blue-700">
          <p className="text-sm">Số dư</p>
          <p className="text-xl font-bold">{summary.balance.toLocaleString("vi-VN")}đ</p>
        </div>
      </div>

      <form onSubmit={createTx} className="grid grid-cols-1 gap-3 rounded-xl border border-neutral-200 bg-white p-4 sm:grid-cols-2 md:grid-cols-4">
        <select
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
          value={form.type}
          onChange={(e) => setForm({ ...form, type: e.target.value as Transaction["type"] })}
        >
          <option value="INCOME">Thu</option>
          <option value="EXPENSE">Chi</option>
        </select>
        <input
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
          placeholder="Danh mục (VD: Tiền phòng, Điện nước)"
          value={form.category}
          onChange={(e) => setForm({ ...form, category: e.target.value })}
        />
        <input
          type="number"
          min={0}
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
          placeholder="Số tiền"
          value={form.amount || ""}
          onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
        />
        <button className="rounded-md bg-orange-500 px-3 py-2 text-sm font-medium text-white hover:bg-orange-600">
          Ghi nhận
        </button>
        <input
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm sm:col-span-2 md:col-span-4"
          placeholder="Ghi chú (tuỳ chọn)"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
      </form>

      {loading ? (
        <p className="text-sm text-neutral-500">Đang tải...</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-neutral-500">
              <tr>
                <th className="px-4 py-2">Ngày</th>
                <th className="px-4 py-2">Loại</th>
                <th className="px-4 py-2">Danh mục</th>
                <th className="px-4 py-2">Ghi chú</th>
                <th className="px-4 py-2 text-right">Số tiền</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
                <tr key={t.id} className="border-t border-neutral-100">
                  <td className="px-4 py-2">{new Date(t.occurredAt).toLocaleDateString("vi-VN")}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        t.type === "INCOME" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                      }`}
                    >
                      {t.type === "INCOME" ? "Thu" : "Chi"}
                    </span>
                  </td>
                  <td className="px-4 py-2">{t.category}</td>
                  <td className="px-4 py-2 text-neutral-500">{t.description || "—"}</td>
                  <td className={`px-4 py-2 text-right font-medium ${t.type === "INCOME" ? "text-green-700" : "text-red-700"}`}>
                    {t.type === "INCOME" ? "+" : "-"}
                    {t.amount.toLocaleString("vi-VN")}đ
                  </td>
                </tr>
              ))}
              {transactions.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-neutral-400">
                    Chưa có giao dịch nào.
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
