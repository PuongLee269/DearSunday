import { prisma } from "@/lib/prisma";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [items, guests, txSummary] = await Promise.all([
    prisma.item.findMany(),
    prisma.guest.findMany({ orderBy: { createdAt: "desc" }, take: 5 }),
    prisma.transaction.findMany(),
  ]);

  const now = Date.now();
  const dueItems = items.filter((item) => {
    if (!item.lastCaredAt) return true;
    return new Date(item.lastCaredAt).getTime() + item.intervalHours * 3600_000 <= now;
  });

  const income = txSummary.filter((t) => t.type === "INCOME").reduce((s, t) => s + t.amount, 0);
  const expense = txSummary.filter((t) => t.type === "EXPENSE").reduce((s, t) => s + t.amount, 0);
  const flagged = guests.filter((g) => g.status === "FLAGGED").length;

  const cards = [
    { label: "Cần chăm sóc ngay", value: dueItems.length, href: "/items", tone: "bg-red-50 text-red-700" },
    { label: "Khách gần đây", value: guests.length, href: "/guests", tone: "bg-blue-50 text-blue-700" },
    { label: "Khách bị cảnh báo", value: flagged, href: "/guests", tone: "bg-yellow-50 text-yellow-700" },
    {
      label: "Số dư (VNĐ)",
      value: (income - expense).toLocaleString("vi-VN"),
      href: "/finance",
      tone: "bg-green-50 text-green-700",
    },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Tổng quan homestay</h1>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {cards.map((card) => (
          <Link
            key={card.label}
            href={card.href}
            className={`rounded-xl p-4 shadow-sm transition hover:shadow ${card.tone}`}
          >
            <p className="text-sm font-medium">{card.label}</p>
            <p className="mt-1 text-2xl font-bold">{card.value}</p>
          </Link>
        ))}
      </div>

      <section className="rounded-xl border border-neutral-200 bg-white p-4">
        <h2 className="mb-2 font-semibold">Việc cần làm ngay</h2>
        {dueItems.length === 0 ? (
          <p className="text-sm text-neutral-500">Không có việc nào cần chăm sóc ngay 🎉</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {dueItems.map((item) => (
              <li key={item.id} className="flex justify-between border-b border-neutral-100 py-1 last:border-0">
                <span>{item.name}</span>
                <span className="text-neutral-500">{categoryLabel(item.category)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function categoryLabel(category: string) {
  switch (category) {
    case "FURNITURE":
      return "Đồ đạc";
    case "GAME":
      return "Trò chơi";
    case "PLANT":
      return "Cây cảnh";
    default:
      return "Khác";
  }
}
