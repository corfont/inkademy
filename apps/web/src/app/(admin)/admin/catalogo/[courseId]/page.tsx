import type { Metadata } from "next";
import { adminApi } from "@/lib/api-client";
import { getServerAccessToken } from "@/lib/server-auth";
import { CourseEditor } from "@/components/admin/CourseEditor";

export const metadata: Metadata = { title: "Editar curso" };

export default async function AdminCourseDetailPage({ params }: { params: { courseId: string } }) {
  const accessToken = getServerAccessToken();
  const course = await adminApi.courseDetail(params.courseId, accessToken);
  return <CourseEditor course={course} />;
}
