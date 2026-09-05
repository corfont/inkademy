import type { Metadata } from "next";
import { adminApi } from "@/lib/api-client";
import { getServerAccessToken } from "@/lib/server-auth";
import { CourseEditor } from "@/components/admin/CourseEditor";

export const metadata: Metadata = { title: "Editar mi curso" };

/**
 * Mismo componente que usa /admin/catalogo/:courseId — CourseEditor no
 * distingue quién lo renderiza más que por `viewerRole`, así que no hace
 * falta duplicarlo. La restricción real (que este docente sea CourseStaff
 * de este curso) ya la aplica AdminService.getCourseDetail/updateCourse del
 * lado del backend. `viewerRole="TEACHER"` oculta la pestaña "Comercial"
 * (precio, descuento, plantilla de certificado, plazo de acceso) — antes un
 * docente que solo quería subir un video se topaba con ~16 campos
 * comerciales/administrativos que no le correspondía tocar.
 */
export default async function TeacherCourseDetailPage({ params }: { params: { courseId: string } }) {
  const accessToken = getServerAccessToken();
  const course = await adminApi.courseDetail(params.courseId, accessToken);
  return <CourseEditor course={course} viewerRole="TEACHER" />;
}
