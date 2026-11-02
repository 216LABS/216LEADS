import Link from "next/link";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";
import { Logo } from "@/components/logo";

export const metadata = { title: "Start your free trial" };

export default function SignupPage() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-10">
      <Link href="/" className="mb-8 self-center">
        <Logo />
      </Link>
      <h1 className="mb-1 text-center text-2xl font-bold">Start your 14-day trial</h1>
      <p className="mb-6 text-center text-sm text-slate">No card needed. Takes about 3 minutes.</p>
      <Suspense>
        <AuthForm mode="signup" googleEnabled={process.env.GOOGLE_AUTH_ENABLED === "true"} />
      </Suspense>
    </div>
  );
}
