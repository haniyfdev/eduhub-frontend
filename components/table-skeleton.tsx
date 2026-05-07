import { Skeleton } from '@/components/ui/skeleton';

interface TableSkeletonProps {
  columns: number;
  rows?: number;
}

export default function TableSkeleton({ columns, rows = 5 }: TableSkeletonProps) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} className="border-b border-gray-100">
          {Array.from({ length: columns }).map((_, j) => (
            <td key={j} className="px-4 py-3">
              <Skeleton className={`h-4 animate-pulse ${j === 0 ? 'w-3/4' : j === columns - 1 ? 'w-1/2' : 'w-full'}`} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
