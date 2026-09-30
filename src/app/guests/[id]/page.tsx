"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type Verification = {
  id: string;
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";
  summary: string;
  createdAt: string;
};

type AccessCode = {
  id: string;
  code: string;
  lockDeviceId: string;
  validFrom: string;
  validTo: string;
  status: string;
};

type Guest = {
  id: string;
  fullName: string;
  phone: string;
  status: string;
  verifications: Verification[];
  accessCodes: AccessCode[];
};

const riskTone: Record<Verification["riskLevel"], string> = {
  LOW: "bg-green-100 text-green-700",
  MEDIUM: "bg-yellow-100 text-yellow-700",
  HIGH: "bg-red-100 text-red-700",
  UNKNOWN: "bg-neutral-100 text-neutral-600",
};

export default function GuestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [guest, setGuest] = useState<Guest | null>(null);
  const [profileText, setProfileText] = useState("");
  const [phone, setPhone] = useState("");
  const [verifying, setVerifying] = useState(false);

  const [lockDeviceId, setLockDeviceId] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [validFrom, setValidFrom] = useState("");
  const [validTo, setValidTo] = useState("");
  const [creatingCode, setCreatingCode] = useState(false);

  async function load() {
    const res = await fetch("/api/guests");
    const guests: Guest[] = await res.json();
    const found = guests.find((g) => g.id === id) ?? null;
    setGuest(found);
    if (found) setPhone(found.phone);
  }

  useEffect(() => {
    if (id) load();
  }, [id]);

  async function submitVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!profileText.trim() || !phone.trim()) return;
    setVerifying(true);
    try {
      await fetch(`/api/guests/${id}/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ profileText, phone }),
      });
      setProfileText("");
      await load();
    } finally {
      setVerifying(false);
    }
  }

  async function createAccessCode(e: React.FormEvent) {
    e.preventDefault();
    if (!lockDeviceId || !validFrom || !validTo) return;
    setCreatingCode(true);
    try {
      await fetch(`/api/guests/${id}/access-code`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          lockDeviceId,
          validFrom: new Date(validFrom).toISOString(),
          validTo: new Date(validTo).toISOString(),
          notifyByEmail: Boolean(guestEmail),
          guestEmail: guestEmail || undefined,
        }),
      });
      await load();
    } finally {
      setCreatingCode(false);
    }
  }

  if (!guest) return <p className="text-sm text-neutral-500">Đang tải...</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{guest.fullName}</h1>
        <p className="text-sm text-neutral-500">{guest.phone}</p>
      </div>

      {/* Box chat AI kiểm tra thông tin khách */}
      <section className="rounded-xl border border-neutral-200 bg-white p-4">
        <h2 className="mb-1 font-semibold">Kiểm tra thông tin khách bằng AI</h2>
        <p className="mb-3 text-xs text-neutral-500">
          Dán profile (mạng xã hội, hồ sơ đặt phòng...) và số điện thoại của khách để AI tìm kiếm,
          đối chiếu và cảnh báo dấu hiệu giả mạo / clone / lừa đảo.
        </p>
        <form onSubmit={submitVerify} className="space-y-3">
          <textarea
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            rows={5}
            placeholder="Dán profile khách vào đây..."
            value={profileText}
            onChange={(e) => setProfileText(e.target.value)}
          />
          <input
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
            placeholder="Số điện thoại"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <button
            disabled={verifying}
            className="rounded-md bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
          >
            {verifying ? "Đang kiểm tra..." : "Kiểm tra ngay"}
          </button>
        </form>

        <div className="mt-4 space-y-3">
          {guest.verifications.map((v) => (
            <div key={v.id} className="rounded-lg border border-neutral-100 p-3">
              <div className="mb-1 flex items-center justify-between">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${riskTone[v.riskLevel]}`}>
                  Rủi ro: {v.riskLevel}
                </span>
                <span className="text-xs text-neutral-400">
                  {new Date(v.createdAt).toLocaleString("vi-VN")}
                </span>
              </div>
              <p className="text-sm">{v.summary}</p>
            </div>
          ))}
          {guest.verifications.length === 0 && (
            <p className="text-sm text-neutral-400">Chưa có lần kiểm tra nào.</p>
          )}
        </div>
      </section>

      {/* Mã khóa thông minh */}
      <section className="rounded-xl border border-neutral-200 bg-white p-4">
        <h2 className="mb-3 font-semibold">Tạo mã khóa cửa thông minh</h2>
        <form onSubmit={createAccessCode} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
            placeholder="ID thiết bị khóa (lockDeviceId)"
            value={lockDeviceId}
            onChange={(e) => setLockDeviceId(e.target.value)}
          />
          <input
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
            type="email"
            placeholder="Email khách (để gửi mã tự động)"
            value={guestEmail}
            onChange={(e) => setGuestEmail(e.target.value)}
          />
          <input
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
            type="datetime-local"
            value={validFrom}
            onChange={(e) => setValidFrom(e.target.value)}
          />
          <input
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
            type="datetime-local"
            value={validTo}
            onChange={(e) => setValidTo(e.target.value)}
          />
          <button
            disabled={creatingCode}
            className="rounded-md bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50 sm:col-span-2"
          >
            {creatingCode ? "Đang tạo..." : "Tạo mã & gửi email"}
          </button>
        </form>

        <div className="mt-4 space-y-2">
          {guest.accessCodes.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-lg border border-neutral-100 p-3 text-sm">
              <div>
                <span className="font-mono text-lg font-bold">{c.code}</span>
                <span className="ml-2 text-xs text-neutral-500">({c.lockDeviceId})</span>
              </div>
              <span className="text-xs text-neutral-500">
                {new Date(c.validFrom).toLocaleString("vi-VN")} → {new Date(c.validTo).toLocaleString("vi-VN")}
              </span>
            </div>
          ))}
          {guest.accessCodes.length === 0 && (
            <p className="text-sm text-neutral-400">Chưa có mã khóa nào.</p>
          )}
        </div>
      </section>
    </div>
  );
}
