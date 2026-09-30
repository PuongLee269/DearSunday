import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const createTxSchema = z.object({
  type: z.enum(["INCOME", "EXPENSE"]),
  category: z.string().min(1),
  amount: z.number().positive(),
  description: z.string().optional(),
  guestId: z.string().optional(),
  occurredAt: z.string().datetime().optional(),
});

export async function GET() {
  const transactions = await prisma.transaction.findMany({
    orderBy: { occurredAt: "desc" },
    include: { guest: { select: { fullName: true } } },
  });

  const totalIncome = transactions
    .filter((t) => t.type === "INCOME")
    .reduce((sum, t) => sum + t.amount, 0);
  const totalExpense = transactions
    .filter((t) => t.type === "EXPENSE")
    .reduce((sum, t) => sum + t.amount, 0);

  return NextResponse.json({
    transactions,
    summary: { totalIncome, totalExpense, balance: totalIncome - totalExpense },
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = createTxSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { occurredAt, ...rest } = parsed.data;
  const tx = await prisma.transaction.create({
    data: {
      ...rest,
      occurredAt: occurredAt ? new Date(occurredAt) : undefined,
    },
  });
  return NextResponse.json(tx, { status: 201 });
}
