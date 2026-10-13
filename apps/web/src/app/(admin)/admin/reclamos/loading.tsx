import { TableSkeleton } from "@/components/data/TableSkeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl">
      <TableSkeleton rows={5} columns={3} />
    </div>
  );
}
