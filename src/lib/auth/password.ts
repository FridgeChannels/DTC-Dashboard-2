const HAS_LETTER = /[a-zA-Z]/;
const HAS_DIGIT = /[0-9]/;

export const PASSWORD_MIN_LENGTH = 6;

export function passwordComplexityError(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
  }
  if (!HAS_LETTER.test(password) || !HAS_DIGIT.test(password)) {
    return "Password must contain both letters and numbers";
  }
  return null;
}
