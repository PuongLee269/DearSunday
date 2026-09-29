import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const item = await prisma.item.update({
    where: { id },
    data: {
      lastCaredAt: new Date(),
      careLogs: {
        create: { note: body?.note, doneBy: body?.doneBy },
      },
    },
    include: { careLogs: { orderBy: { doneAt: "desc" }, take: 5 } },
  });

  return NextResponse.json(item);
}
