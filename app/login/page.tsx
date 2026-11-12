export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const { e } = await searchParams;
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <form action="/api/login" method="post" className="card w-full max-w-sm p-6">
        <div className="mb-1 text-xl font-bold text-accent">Inzivo Monitor</div>
        <p className="mb-4 text-sm text-slate-500">Read-only check-in monitoring</p>
        {e === "limit" ? (
          <p className="mb-3 rounded bg-red-50 p-2 text-sm text-red-700">Too many failed attempts. Try again in 10 minutes.</p>
        ) : e ? (
          <p className="mb-3 rounded bg-red-50 p-2 text-sm text-red-700">Incorrect password.</p>
        ) : null}
        <label className="mb-1 block text-sm font-medium" htmlFor="password">Password</label>
        <input id="password" name="password" type="password" required autoFocus autoComplete="current-password" className="input mb-4 w-full" />
        <button type="submit" className="btn w-full">Sign in</button>
      </form>
    </div>
  );
}
