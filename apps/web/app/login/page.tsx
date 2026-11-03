import Link from "next/link";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";
import { Logo } from "@/components/logo";

export const metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-10">
      <Link href="/" className="mb-8 self-center">
        <Logo />
      </Link>
      <h1 className="mb-1 text-center text-title font-semibold">Welcome back</h1>
      <p className="mb-6 text-center text-sm text-slate">See which homes need you next.</p>
      <Suspense>
        <AuthForm mode="login" googleEnabled={process.env.GOOGLE_AUTH_ENABLED === "true"} />
      </Suspense>
    </main>
  );
}
