import type { RiskLevel } from "@prisma/client";

export interface VerificationResult {
  riskLevel: RiskLevel;
  summary: string;
  rawResponse?: string;
}

const SUSPICIOUS_PHONE_PATTERNS = [/^0{6,}/, /^(\d)\1{6,}$/, /^1234567/];

/**
 * Kiểm tra thông tin khách (profile + số điện thoại) để phát hiện dấu hiệu
 * giả mạo / lừa đảo (clone tài khoản, hồ sơ không nhất quán, số điện thoại
 * đáng ngờ...). Dùng Anthropic API nếu có ANTHROPIC_API_KEY, ngược lại rơi
 * về chế độ kiểm tra theo quy tắc (rule-based) để app vẫn hoạt động offline.
 */
export async function verifyGuest(
  profileText: string,
  phone: string
): Promise<VerificationResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey) {
    try {
      return await verifyWithAnthropic(profileText, phone, apiKey);
    } catch (err) {
      console.error("Anthropic verification failed, falling back to rule-based:", err);
    }
  }
  return verifyWithRules(profileText, phone);
}

async function verifyWithAnthropic(
  profileText: string,
  phone: string,
  apiKey: string
): Promise<VerificationResult> {
  const prompt = `Bạn là trợ lý an ninh cho một homestay tại Việt Nam. Nhiệm vụ: đọc hồ sơ (profile) và số điện thoại của một khách đặt phòng, tìm kiếm dấu hiệu giả mạo, tài khoản clone, hoặc lừa đảo (ví dụ: ảnh đại diện không khớp thông tin, tên/số điện thoại không nhất quán, hồ sơ mới tạo, thiếu lịch sử hoạt động, số điện thoại có mẫu bất thường...).

Hồ sơ khách:
"""
${profileText}
"""

Số điện thoại: ${phone}

Trả lời NGẮN GỌN theo đúng định dạng:
RISK: <LOW|MEDIUM|HIGH>
SUMMARY: <tóm tắt 2-4 câu bằng tiếng Việt về thông tin khách và lý do đánh giá mức rủi ro>`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-5-5",
      max_tokens: 512,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Anthropic API error: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  const text: string = data?.content?.[0]?.text ?? "";
  const riskMatch = text.match(/RISK:\s*(LOW|MEDIUM|HIGH)/i);
  const summaryMatch = text.match(/SUMMARY:\s*([\s\S]*)/i);

  const riskLevel = (riskMatch?.[1]?.toUpperCase() as RiskLevel) ?? "UNKNOWN";
  const summary = summaryMatch?.[1]?.trim() || text.trim() || "Không có tóm tắt.";

  return { riskLevel, summary, rawResponse: text };
}

function verifyWithRules(profileText: string, phone: string): VerificationResult {
  const reasons: string[] = [];
  let score = 0;

  const normalizedPhone = phone.replace(/\s+/g, "");
  if (!/^(0|\+84)\d{9,10}$/.test(normalizedPhone)) {
    reasons.push("Số điện thoại không đúng định dạng Việt Nam");
    score += 2;
  }
  if (SUSPICIOUS_PHONE_PATTERNS.some((re) => re.test(normalizedPhone.replace(/^\+84/, "0")))) {
    reasons.push("Số điện thoại có mẫu lặp/bất thường, nghi ngờ số ảo");
    score += 3;
  }
  if (!profileText || profileText.trim().length < 20) {
    reasons.push("Hồ sơ quá sơ sài, thiếu thông tin để đối chiếu");
    score += 2;
  }
  if (/http:\/\/|bit\.ly|zalo\.me\/g\//i.test(profileText)) {
    reasons.push("Hồ sơ chứa liên kết rút gọn/đáng ngờ");
    score += 2;
  }
  if (/mới tạo|new account|0 bạn bè|0 friends/i.test(profileText)) {
    reasons.push("Có dấu hiệu tài khoản mới tạo, ít hoạt động (nghi clone)");
    score += 3;
  }

  let riskLevel: RiskLevel = "LOW";
  if (score >= 5) riskLevel = "HIGH";
  else if (score >= 2) riskLevel = "MEDIUM";

  const summary =
    reasons.length > 0
      ? `Phát hiện ${reasons.length} dấu hiệu cần lưu ý: ${reasons.join("; ")}.`
      : "Không phát hiện dấu hiệu bất thường rõ ràng từ hồ sơ và số điện thoại đã cung cấp. Vẫn nên đối chiếu thêm khi khách nhận phòng.";

  return { riskLevel, summary };
}
