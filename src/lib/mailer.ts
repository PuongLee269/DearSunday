import nodemailer from "nodemailer";

export interface SendMailResult {
  status: "sent" | "logged";
}

/**
 * Gửi email tự động cho khách. Nếu chưa cấu hình SMTP_*, chỉ log nội dung
 * ra console (chế độ dev/demo) thay vì gửi thật.
 */
export async function sendGuestEmail(
  to: string,
  subject: string,
  body: string
): Promise<SendMailResult> {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.log(`[mailer:mock] To: ${to}\nSubject: ${subject}\n\n${body}`);
    return { status: "logged" };
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  await transporter.sendMail({
    from: SMTP_FROM || SMTP_USER,
    to,
    subject,
    text: body,
  });

  return { status: "sent" };
}
