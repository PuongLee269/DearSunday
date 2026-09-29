import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const createGuestSchema = z.object({
  fullName: z.string().min(1),
  phone: z.string().min(1),
  idNumber: z.string().optional(),
  profileText: z.string().optional(),
  checkInAt: z.string().datetime().optional(),
  checkOutAt: z.string().datetime().optional(),
});

export async function GET() {
  const guests = await prisma.guest.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      verifications: { orderBy: { createdAt: "desc" }, take: 1 },
      accessCodes: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  return NextResponse.json(guests);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = createGuestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { checkInAt, checkOutAt, ...rest } = parsed.data;
  const guest = await prisma.guest.create({
    data: {
      ...rest,
      checkInAt: checkInAt ? new Date(checkInAt) : undefined,
      checkOutAt: checkOutAt ? new Date(checkOutAt) : undefined,
    },
  });
  return NextResponse.json(guest, { status: 201 });
}
