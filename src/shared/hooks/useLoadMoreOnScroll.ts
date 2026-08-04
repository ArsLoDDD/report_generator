import type { UIEvent } from "react";

type InfiniteScrollOptions = {
  hasMore: boolean;
  isLoading: boolean;
  loadMore: () => Promise<void>;
};

/** Loads the next fixed-size page shortly before a scrollable list reaches its end. */
export function useLoadMoreOnScroll({ hasMore, isLoading, loadMore }: InfiniteScrollOptions) {
  return (event: UIEvent<HTMLElement>) => {
    const target = event.currentTarget;
    const reachedEnd = target.scrollTop + target.clientHeight >= target.scrollHeight - 80;
    if (reachedEnd && hasMore && !isLoading) void loadMore();
  };
}
