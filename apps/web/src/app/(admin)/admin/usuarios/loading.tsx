import { TableSkeleton } from "@/components/data/TableSkeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl">
      <TableSkeleton columns={5} />
    </div>
  );
}
