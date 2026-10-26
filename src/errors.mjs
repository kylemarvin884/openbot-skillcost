export class SkillcostError extends Error {
  constructor(code, message, { cause, ...details } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = 'SkillcostError';
    this.code = code;
    this.details = details;
  }
}

export function usageError(message) {
  return new SkillcostError('E_USAGE', message);
}
