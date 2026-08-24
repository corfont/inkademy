import Link from "next/link";
import { BrandLogo } from "@/components/layout/BrandLogo";
import { LocaleSwitcher } from "@/components/layout/LocaleSwitcher";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-paper-muted">
      <header className="container flex h-16 items-center justify-between">
        <Link href="/" aria-label="Inkademy">
          <BrandLogo />
        </Link>
        <LocaleSwitcher />
      </header>
      <main id="main-content" className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
