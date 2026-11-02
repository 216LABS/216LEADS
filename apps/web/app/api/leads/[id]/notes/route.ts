// POST /api/leads/:id/notes (spec 8): add a note to a lead.
import { z } from "zod";
import { ApiError, apiOrg, body, handle, json } from "@/lib/api";
import { addNote } from "@/lib/leads";

const Body = z.object({ body: z.string().trim().min(1).max(4000) });

export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { org, user } = await apiOrg();
  const { id } = await params;
  const { body: text } = await body(req, Body);
  if (!z.string().uuid().safeParse(id).success || !(await addNote(org.id, id, user.id, text))) throw new ApiError(404, "Lead not found");
  return json({ ok: true }, 201);
});
