import type { CourseCardDTO } from "@inkademy/shared";
import Link from "next/link";
import { CourseCard } from "./CourseCard";
import { cn } from "@/lib/cn";

export function SectionCarousel({
  title,
  courses,
  viewAllHref,
  viewAllLabel,
  className,
}: {
  title: string;
  courses: CourseCardDTO[];
  viewAllHref?: string;
  viewAllLabel?: string;
  className?: string;
}) {
  if (courses.length === 0) return null;
  return (
    <section className={cn("py-10", className)} aria-label={title}>
      <div className="container">
        <div className="mb-5 flex items-end justify-between gap-4">
          <h2 className="font-serif text-2xl font-semibold text-ink-900">{title}</h2>
          {viewAllHref && (
            <Link href={viewAllHref} className="whitespace-nowrap text-sm font-medium text-ink-700 hover:underline">
              {viewAllLabel}
            </Link>
          )}
        </div>
        <div className="-mx-5 flex snap-x gap-4 overflow-x-auto px-5 pb-2" tabIndex={0} role="list" aria-label={title}>
          {courses.map((course) => (
            <div key={course.id} role="listitem" className="w-72 flex-none snap-start sm:w-80">
              <CourseCard course={course} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
