import NavLinks from "./NavLinks";

function Logout() {
  return (
    <form action="/api/logout" method="post">
      <button className="btn-ghost w-full" type="submit">Log out</button>
    </form>
  );
}

export default function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="md:flex min-h-screen">
      <aside className="hidden md:flex md:w-56 shrink-0 flex-col gap-4 border-r border-slate-200 bg-white p-4 sticky top-0 h-screen">
        <div className="text-lg font-bold text-accent">Inzivo Monitor</div>
        <NavLinks orientation="side" />
        <div className="mt-auto"><Logout /></div>
      </aside>
      <header className="md:hidden sticky top-0 z-[1000] border-b border-slate-200 bg-white px-3 py-2">
        <div className="mb-2 flex items-center justify-between">
          <span className="font-bold text-accent">Inzivo Monitor</span>
          <Logout />
        </div>
        <NavLinks orientation="top" />
      </header>
      <main className="min-w-0 flex-1 p-3 md:p-6">{children}</main>
    </div>
  );
}
