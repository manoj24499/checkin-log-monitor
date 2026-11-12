import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

const ID = /^[A-Za-z0-9_-]{1,64}$/;

// Failed-face-verification photo stored on a CheckInAttempt row (FACE_MISMATCH only, cleared after retention).
export async function GET(_req: Request, ctx: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await ctx.params;
  if (!ID.test(attemptId)) return new Response("Not found", { status: 404 });
  const rows = await query<{ photo: Buffer | null }>(
    `SELECT "photo" FROM "CheckInAttempt" WHERE "id" = $1 AND "hasPhoto" = true LIMIT 1`,
    [attemptId],
  );
  const photo = rows[0]?.photo;
  if (!photo) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(photo), {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
