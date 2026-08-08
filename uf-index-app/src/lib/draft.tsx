// The in-progress assessment draft, shared across the flow screens.
import React, { createContext, useContext, useState } from 'react';
import { AssessmentInput } from './scoring';

const DEFAULT_DRAFT: AssessmentInput = {
  gender: 'male',
  weightKg: 82, heightCm: 178, neckCm: 38, waistCm: 86, hipCm: 98,
  rpeMorning: 3, rpeAfternoon: 2, bodyFeeling: 3, sleepQuality: 3, sleepHours: 7,
};

interface DraftApi {
  draft: AssessmentInput;
  set: (p: Partial<AssessmentInput>) => void;
  reset: () => void;
}

const Ctx = createContext<DraftApi>({ draft: DEFAULT_DRAFT, set: () => {}, reset: () => {} });

export function DraftProvider({ children }: { children: React.ReactNode }) {
  const [draft, setDraft] = useState<AssessmentInput>(DEFAULT_DRAFT);
  return (
    <Ctx.Provider value={{
      draft,
      set: p => setDraft(d => ({ ...d, ...p })),
      reset: () => setDraft(DEFAULT_DRAFT),
    }}>
      {children}
    </Ctx.Provider>
  );
}

export const useDraft = () => useContext(Ctx);
