import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { LocaleSwitcher } from "@/components/layout/LocaleSwitcher";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-paper-muted">
      <header className="container flex h-16 items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-serif text-xl font-semibold text-ink-900">
          <GraduationCap className="h-6 w-6 text-gold-500" aria-hidden="true" />
          Inkademy
        </Link>
        <LocaleSwitcher />
      </header>
      <main id="main-content" className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
