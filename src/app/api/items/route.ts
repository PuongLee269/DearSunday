import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const createItemSchema = z.object({
  name: z.string().min(1),
  category: z.enum(["FURNITURE", "GAME", "PLANT", "OTHER"]),
  intervalHours: z.number().int().positive(),
  notes: z.string().optional(),
});

export async function GET() {
  const items = await prisma.item.findMany({
    orderBy: { createdAt: "desc" },
    include: { careLogs: { orderBy: { doneAt: "desc" }, take: 1 } },
  });

  const now = Date.now();
  const withStatus = items.map((item) => {
    const dueAt = item.lastCaredAt
      ? new Date(item.lastCaredAt).getTime() + item.intervalHours * 3600_000
      : null;
    const isDue = dueAt === null || dueAt <= now;
    return { ...item, isDue, dueAt: dueAt ? new Date(dueAt).toISOString() : null };
  });

  return NextResponse.json(withStatus);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = createItemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const item = await prisma.item.create({ data: parsed.data });
  return NextResponse.json(item, { status: 201 });
}
