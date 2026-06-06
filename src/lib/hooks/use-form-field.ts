"use client";

import { useState } from "react";
import { validate, type Validator } from "@/lib/validation";

export type FormField = {
  value: string;
  setValue: (value: string) => void;
  /** Erro atual (independente de o campo ter sido tocado). */
  error: string | null;
  /** Erro a ser exibido: só aparece após o campo perder o foco. */
  visibleError: string | null;
  touched: boolean;
  markTouched: () => void;
  reset: (value?: string) => void;
  isValid: boolean;
};

/**
 * Estado de um campo de formulário com validação em tempo real.
 * O erro só é exposto para exibição (`visibleError`) depois que o usuário
 * interage com o campo (on blur), evitando "erros prematuros".
 */
export function useFormField(
  initialValue: string,
  validators: Validator[],
): FormField {
  const [value, setValue] = useState(initialValue);
  const [touched, setTouched] = useState(false);

  const error = validate(value, validators);

  return {
    value,
    setValue,
    error,
    visibleError: touched ? error : null,
    touched,
    markTouched: () => setTouched(true),
    reset: (next = "") => {
      setValue(next);
      setTouched(false);
    },
    isValid: error === null,
  };
}
