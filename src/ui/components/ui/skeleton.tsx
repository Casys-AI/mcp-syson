import { cx } from "../utils";

export interface SkeletonProps {
  className?: string;
  width?: string;
  height?: string;
  circle?: boolean;
}

export function Skeleton({ className, width, height, circle }: SkeletonProps) {
  return (
    <div
      className={cx(
        "animate-pulse bg-gray-200 dark:bg-gray-700",
        circle ? "rounded-full" : "rounded",
        className
      )}
      style={{ width, height }}
    />
  );
}

export interface SkeletonTextProps {
  lines?: number;
  className?: string;
  gap?: string;
}

export function SkeletonText({ lines = 3, className, gap = "8px" }: SkeletonTextProps) {
  return (
    <div className={cx("flex flex-col w-full", className)} style={{ gap }}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          height="16px"
          width={i === lines - 1 ? "60%" : "100%"}
        />
      ))}
    </div>
  );
}
