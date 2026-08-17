import { atomWithStorage, atomFamily } from 'jotai/utils'

export const lastSelectedAgentAtom = atomWithStorage<string | null>('last-selected-agent', null)
export const lastSelectedModelAtomFamily = atomFamily((agent: string) =>
  atomWithStorage<string | null>(`last-selected-model-${agent}`, null),
)
