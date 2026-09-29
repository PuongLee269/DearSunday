import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyGuest } from "@/lib/guest-verification";
import { z } from "zod";

const verifySchema = z.object({
  profileText: z.string().min(1, "Vui lòng dán profile khách hàng"),
  phone: z.string().min(1, "Vui lòng nhập số điện thoại"),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const parsed = verifySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { profileText, phone } = parsed.data;
  const result = await verifyGuest(profileText, phone);

  const [verification] = await prisma.$transaction([
    prisma.guestVerification.create({
      data: {
        guestId: id,
        inputProfile: profileText,
        inputPhone: phone,
        riskLevel: result.riskLevel,
        summary: result.summary,
        rawResponse: result.rawResponse,
      },
    }),
    prisma.guest.update({
      where: { id },
      data: {
        profileText,
        phone,
        status: result.riskLevel === "HIGH" ? "FLAGGED" : "VERIFIED",
      },
    }),
  ]);

  return NextResponse.json(verification, { status: 201 });
}
