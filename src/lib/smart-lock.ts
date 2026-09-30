/**
 * Interface tích hợp API ổ khóa thông minh. Nếu SMART_LOCK_API_BASE_URL /
 * SMART_LOCK_API_KEY chưa được cấu hình, dùng chế độ giả lập (mock) để app
 * vẫn hoạt động được trong môi trường phát triển / demo.
 *
 * Để nối vào ổ khóa thật (TTLock, Sciener, Yale, Xiaomi...), điều chỉnh
 * phần `callRealApi` cho đúng schema request/response của nhà cung cấp.
 */
export interface CreateAccessCodeParams {
  lockDeviceId: string;
  guestName: string;
  validFrom: Date;
  validTo: Date;
}

export interface CreateAccessCodeResult {
  code: string;
  externalId?: string;
}

export async function createSmartLockAccessCode(
  params: CreateAccessCodeParams
): Promise<CreateAccessCodeResult> {
  const baseUrl = process.env.SMART_LOCK_API_BASE_URL;
  const apiKey = process.env.SMART_LOCK_API_KEY;

  if (baseUrl && apiKey) {
    return callRealApi(baseUrl, apiKey, params);
  }
  return mockCreateAccessCode(params);
}

export async function revokeSmartLockAccessCode(
  lockDeviceId: string,
  externalId?: string | null
): Promise<void> {
  const baseUrl = process.env.SMART_LOCK_API_BASE_URL;
  const apiKey = process.env.SMART_LOCK_API_KEY;

  if (baseUrl && apiKey && externalId) {
    await fetch(`${baseUrl}/locks/${lockDeviceId}/codes/${externalId}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${apiKey}` },
    }).catch((err) => console.error("Failed to revoke smart lock code:", err));
    return;
  }
  console.log(`[smart-lock:mock] Revoked code for lock ${lockDeviceId} (externalId=${externalId ?? "n/a"})`);
}

async function callRealApi(
  baseUrl: string,
  apiKey: string,
  { lockDeviceId, guestName, validFrom, validTo }: CreateAccessCodeParams
): Promise<CreateAccessCodeResult> {
  const res = await fetch(`${baseUrl}/locks/${lockDeviceId}/codes`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      name: guestName,
      validFrom: validFrom.toISOString(),
      validTo: validTo.toISOString(),
    }),
  });

  if (!res.ok) {
    throw new Error(`Smart lock API error: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  return { code: data.code ?? data.passcode, externalId: data.id ?? data.codeId };
}

function mockCreateAccessCode(params: CreateAccessCodeParams): CreateAccessCodeResult {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  console.log(
    `[smart-lock:mock] Created code ${code} for lock ${params.lockDeviceId}, guest ${params.guestName}, ` +
      `valid ${params.validFrom.toISOString()} -> ${params.validTo.toISOString()}`
  );
  return { code, externalId: `mock-${Date.now()}` };
}
