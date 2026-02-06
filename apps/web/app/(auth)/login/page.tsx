export default function LoginPage() {
  return (
    <main className="mx-auto mt-24 max-w-sm rounded border bg-white p-6">
      <h1 className="mb-4 text-xl font-semibold">Login</h1>
      <form className="space-y-3">
        <input className="w-full rounded border p-2" placeholder="email" />
        <input className="w-full rounded border p-2" placeholder="password" type="password" />
        <button className="w-full rounded bg-slate-900 p-2 text-white" type="button">
          Entrar
        </button>
      </form>
    </main>
  );
}
