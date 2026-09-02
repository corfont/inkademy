import type { Metadata } from "next";
import { AuditLogViewer } from "@/components/admin/AuditLogViewer";

export const metadata: Metadata = { title: "Auditoría (admin)" };

export default function AuditoriaPage() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <AuditLogViewer />
    </div>
  );
}
