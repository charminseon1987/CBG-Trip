import { notFound, ok } from "@/lib/http";
import { store } from "@/lib/store";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; expenseId: string }> },
) {
  const { id, expenseId } = await params;
  const gone = await store.deleteExpense(id, expenseId);
  return gone ? ok({ deleted: expenseId }) : notFound("지출");
}
