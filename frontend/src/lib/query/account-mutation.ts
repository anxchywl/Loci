"use client";

import {
  useMutation,
  type UseMutationOptions,
  type UseMutationResult,
} from "@tanstack/react-query";

import { getAuthEpoch } from "@/lib/api";

/** the caller's own context, carried alongside the epoch the mutation started in */
interface Guarded<TContext> {
  epoch: number;
  inner: TContext | undefined;
}

/**
 * A mutation that goes quiet if the account changed while it was running.
 *
 * Cancelling queries does not touch mutations, and an unguarded callback is
 * worse than a stale read: `onError` rollbacks and `onSuccess` invalidations
 * write to the cache by key, so a reaction or upload started by the previous
 * account would land in the current account's namespace after a switch. The
 * request itself is already rejected by the epoch check in `apiFetch`; this
 * stops the callbacks from acting on whatever it returned.
 */
export function useAccountMutation<TData, TError, TVariables, TContext>(
  options: UseMutationOptions<TData, TError, TVariables, TContext>,
): UseMutationResult<TData, TError, TVariables, Guarded<TContext>> {
  const { onMutate, onSuccess, onError, onSettled, ...rest } = options;
  const current = (guard: Guarded<TContext> | undefined) =>
    guard !== undefined && guard.epoch === getAuthEpoch();

  return useMutation<TData, TError, TVariables, Guarded<TContext>>({
    ...rest,
    onMutate: async (variables, context) => ({
      epoch: getAuthEpoch(),
      inner: await onMutate?.(variables, context),
    }),
    onSuccess: (data, variables, guard, context) => {
      if (!current(guard)) return;
      // inner is exactly what the caller's own onMutate returned
      return onSuccess?.(data, variables, guard.inner as TContext, context);
    },
    onError: (error, variables, guard, context) => {
      if (!current(guard)) return;
      return onError?.(error, variables, guard?.inner, context);
    },
    onSettled: (data, error, variables, guard, context) => {
      if (!current(guard)) return;
      return onSettled?.(data, error, variables, guard?.inner, context);
    },
  });
}
