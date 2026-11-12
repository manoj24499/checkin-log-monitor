import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

const ID = /^[A-Za-z0-9_-]{1,64}$/;

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!ID.test(id)) return new Response("Not found", { status: 404 });
  const rows = await query<{ photo: Buffer | null }>(
    `SELECT "photo" FROM "Attendance" WHERE "id" = $1 AND "hasPhoto" = true LIMIT 1`,
    [id],
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
