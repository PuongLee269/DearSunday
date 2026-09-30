import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendGuestEmail } from "@/lib/mailer";
import { z } from "zod";

const sendEmailSchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1),
  body: z.string().min(1),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const parsed = sendEmailSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const result = await sendGuestEmail(parsed.data.to, parsed.data.subject, parsed.data.body);
  const log = await prisma.emailLog.create({
    data: {
      guestId: id,
      subject: parsed.data.subject,
      body: parsed.data.body,
      status: result.status,
    },
  });

  return NextResponse.json(log, { status: 201 });
}
