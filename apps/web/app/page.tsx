import { redirect } from "next/navigation";
import { getUser } from "@/lib/session";
import { LinkButton } from "@/components/ui";
import { Logo } from "@/components/logo";

export default async function Home() {
  const user = await getUser();
  if (user) redirect("/leads");
  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col items-center justify-center px-4 text-center">
      <Logo />
      <h1 className="mt-8 text-4xl font-extrabold tracking-tight">Know which homes need you next.</h1>
      <p className="mt-3 text-slate">Northeast Ohio homes ranked for your trade, with the public-record reasons behind each one.</p>
      <div className="mt-8 flex gap-3">
        <LinkButton href="/signup">Start free trial</LinkButton>
        <LinkButton href="/login" variant="secondary">Sign in</LinkButton>
      </div>
    </div>
  );
}
