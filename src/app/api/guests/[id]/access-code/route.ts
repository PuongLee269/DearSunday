import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSmartLockAccessCode } from "@/lib/smart-lock";
import { sendGuestEmail } from "@/lib/mailer";
import { z } from "zod";

const createCodeSchema = z.object({
  lockDeviceId: z.string().min(1),
  validFrom: z.string().datetime(),
  validTo: z.string().datetime(),
  notifyByEmail: z.boolean().optional(),
  guestEmail: z.string().email().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const parsed = createCodeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const guest = await prisma.guest.findUnique({ where: { id } });
  if (!guest) {
    return NextResponse.json({ error: "Không tìm thấy khách" }, { status: 404 });
  }

  const { lockDeviceId, validFrom, validTo, notifyByEmail, guestEmail } = parsed.data;
  const validFromDate = new Date(validFrom);
  const validToDate = new Date(validTo);

  const { code, externalId } = await createSmartLockAccessCode({
    lockDeviceId,
    guestName: guest.fullName,
    validFrom: validFromDate,
    validTo: validToDate,
  });

  const accessCode = await prisma.accessCode.create({
    data: {
      guestId: id,
      code,
      lockDeviceId,
      externalId,
      validFrom: validFromDate,
      validTo: validToDate,
    },
  });

  if (notifyByEmail && guestEmail) {
    const subject = "Mã khóa cửa homestay của bạn";
    const body =
      `Xin chào ${guest.fullName},\n\n` +
      `Mã khóa cửa homestay của bạn là: ${code}\n` +
      `Hiệu lực từ ${validFromDate.toLocaleString("vi-VN")} đến ${validToDate.toLocaleString("vi-VN")}.\n\n` +
      `Vui lòng không chia sẻ mã này cho người khác. Hẹn gặp bạn!\n\nDearSunday Homestay`;

    const result = await sendGuestEmail(guestEmail, subject, body);
    await prisma.emailLog.create({
      data: { guestId: id, subject, body, status: result.status },
    });
  }

  return NextResponse.json(accessCode, { status: 201 });
}
