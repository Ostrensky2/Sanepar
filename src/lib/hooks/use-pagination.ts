"use client";

import { useEffect, useMemo, useState } from "react";

export type PaginationResult<T> = {
  page: number;
  pageSize: number;
  pageCount: number;
  totalItems: number;
  startIndex: number;
  endIndex: number;
  items: T[];
  canPrevious: boolean;
  canNext: boolean;
  setPage: (page: number) => void;
  next: () => void;
  previous: () => void;
  first: () => void;
  last: () => void;
};

/**
 * Paginação client-side genérica para listas em memória.
 * Mantém a página dentro dos limites mesmo quando a lista filtrada muda
 * (ex.: ao aplicar um filtro que reduz o total de itens).
 */
export function usePagination<T>(items: T[], pageSize = 25): PaginationResult<T> {
  const [page, setPageState] = useState(1);

  const totalItems = items.length;
  const pageCount = Math.max(1, Math.ceil(totalItems / pageSize));

  // Reposiciona a página corrente quando o conjunto encolhe.
  useEffect(() => {
    setPageState((current) => Math.min(Math.max(1, current), pageCount));
  }, [pageCount]);

  const safePage = Math.min(Math.max(1, page), pageCount);
  const startIndex = (safePage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);

  const pageItems = useMemo(
    () => items.slice(startIndex, endIndex),
    [items, startIndex, endIndex],
  );

  function setPage(next: number) {
    setPageState(Math.min(Math.max(1, next), pageCount));
  }

  return {
    page: safePage,
    pageSize,
    pageCount,
    totalItems,
    startIndex,
    endIndex,
    items: pageItems,
    canPrevious: safePage > 1,
    canNext: safePage < pageCount,
    setPage,
    next: () => setPage(safePage + 1),
    previous: () => setPage(safePage - 1),
    first: () => setPage(1),
    last: () => setPage(pageCount),
  };
}
