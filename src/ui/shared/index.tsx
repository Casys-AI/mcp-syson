/**
 * Shared UI utilities for lib/syson MCP Apps
 *
 * @module lib/syson/src/ui/shared
 */

import { Skeleton, SkeletonText } from "../components/ui/skeleton";
import { cx } from "../components/utils";

export { Skeleton, SkeletonText, cx };

/** Base container for UI components */
export const containers = {
  root: "p-4 font-sans text-sm text-fg-default bg-bg-canvas",
};

/** Generic content loading skeleton */
export function ContentSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className={containers.root}>
      <Skeleton height="20px" width="60%" className="mb-3" />
      <SkeletonText lines={lines} gap="8px" />
    </div>
  );
}
