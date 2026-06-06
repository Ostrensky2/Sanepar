/**
 * Validadores leves e componíveis (sem dependências externas).
 * Cada validador retorna uma mensagem de erro (string) ou `null` quando válido.
 */
export type Validator = (value: string) => string | null;

export function required(message = "Campo obrigatório."): Validator {
  return (value) => (value.trim().length === 0 ? message : null);
}

export function minLength(length: number, message?: string): Validator {
  return (value) =>
    value.trim().length < length
      ? message ?? `Use pelo menos ${length} caracteres.`
      : null;
}

export function maxLength(length: number, message?: string): Validator {
  return (value) =>
    value.length > length
      ? message ?? `Use no máximo ${length} caracteres.`
      : null;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function email(message = "Informe um e-mail válido."): Validator {
  return (value) => (EMAIL_PATTERN.test(value.trim()) ? null : message);
}

export function pattern(regex: RegExp, message: string): Validator {
  return (value) => (regex.test(value) ? null : message);
}

export function notEqualTo(other: string, message: string): Validator {
  return (value) => (value === other ? message : null);
}

export function equalTo(other: string, message: string): Validator {
  return (value) => (value === other ? null : message);
}

/**
 * Executa validadores em ordem e retorna a primeira mensagem de erro,
 * ou `null` se todos passarem.
 */
export function validate(value: string, validators: Validator[]): string | null {
  for (const check of validators) {
    const result = check(value);

    if (result) {
      return result;
    }
  }

  return null;
}

/**
 * Política de senha usada na troca de senha e cadastro.
 * Mínimo de 8 caracteres com ao menos uma letra e um número.
 */
export function passwordPolicy(): Validator[] {
  return [
    required("Defina uma senha."),
    minLength(8, "A senha deve ter pelo menos 8 caracteres."),
    pattern(/[A-Za-z]/, "Inclua pelo menos uma letra."),
    pattern(/[0-9]/, "Inclua pelo menos um número."),
  ];
}
