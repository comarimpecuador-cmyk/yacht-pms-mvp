import { UseMutationOptions, useMutation } from '@tanstack/react-query';

type BaseMutationOptions<TData, TVariables> = Omit<
  UseMutationOptions<TData, Error, TVariables>,
  'mutationFn'
>;

export function useApiMutation<TData, TVariables>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  options?: BaseMutationOptions<TData, TVariables>,
) {
  return useMutation<TData, Error, TVariables>({
    mutationFn,
    ...options,
  });
}

