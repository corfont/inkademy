import Link from "next/link";
import Image from "next/image";
import { LocaleSwitcher } from "@/components/layout/LocaleSwitcher";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-paper-muted">
      <header className="container flex h-16 items-center justify-between">
        <Link href="/" aria-label="Inkademy">
          <Image src="/brand/logo-horizontal.png" alt="Inkademy" width={643} height={200} className="h-8 w-auto" />
        </Link>
        <LocaleSwitcher />
      </header>
      <main id="main-content" className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
