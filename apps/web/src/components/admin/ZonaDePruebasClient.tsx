"use client";

import { adminApi } from "@/lib/api-client";
import { BulkDeleteSection, type BulkDeleteItem } from "./BulkDeleteSection";
import { CancelTestOrderSection } from "./CancelTestOrderSection";

interface ZonaDePruebasClientProps {
  courseItems: BulkDeleteItem[];
  userItems: BulkDeleteItem[];
  areaItems: BulkDeleteItem[];
  companyItems: BulkDeleteItem[];
}

export function ZonaDePruebasClient({ courseItems, userItems, areaItems, companyItems }: ZonaDePruebasClientProps) {
  return (
    <div className="space-y-6">
      <BulkDeleteSection
        title="Cursos"
        entityLabelSingular="CURSO"
        entityLabelPlural="CURSOS"
        items={courseItems}
        onConfirm={(ids) => adminApi.bulkDeleteCourses(ids)}
      />
      <BulkDeleteSection
        title="Usuarios"
        entityLabelSingular="USUARIO"
        entityLabelPlural="USUARIOS"
        items={userItems}
        onConfirm={(ids) => adminApi.bulkDeleteUsers(ids)}
      />
      <BulkDeleteSection
        title="Áreas / categorías"
        entityLabelSingular="ÁREA"
        entityLabelPlural="ÁREAS"
        items={areaItems}
        onConfirm={(ids) => adminApi.bulkDeleteAreas(ids)}
      />
      <BulkDeleteSection
        title="Empresas (B2B)"
        entityLabelSingular="EMPRESA"
        entityLabelPlural="EMPRESAS"
        items={companyItems}
        onConfirm={(ids) => adminApi.bulkDeleteCompanies(ids)}
      />
      <CancelTestOrderSection />
    </div>
  );
}
