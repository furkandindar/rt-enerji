/**
 * Font-Based Digital Signature Types
 */

// Available signature fonts
export const SIGNATURE_FONTS = ["Ballet", "Great Vibes", "Sacramento"] as const;
export type SignatureFont = (typeof SIGNATURE_FONTS)[number];

// Default signature font
export const DEFAULT_SIGNATURE_FONT: SignatureFont = "Great Vibes";

// Font to CSS class mapping
export const SIGNATURE_FONT_CLASSES: Record<SignatureFont, string> = {
  "Ballet": "font-ballet",
  "Great Vibes": "font-great-vibes",
  "Sacramento": "font-sacramento",
};

// Font display names (for UI)
export const SIGNATURE_FONT_LABELS: Record<SignatureFont, string> = {
  "Ballet": "Ballet",
  "Great Vibes": "Great Vibes",
  "Sacramento": "Sacramento",
};

// Signature data interface
export interface SignatureData {
  text: string;
  font: SignatureFont;
}

// Employee signature fields
export interface EmployeeSignature {
  signature_text: string | null;
  signature_font: SignatureFont | null;
}

/**
 * Check if an employee has a valid signature configured
 */
export function hasValidSignature(employee: EmployeeSignature): boolean {
  return Boolean(employee.signature_text && employee.signature_font);
}

/**
 * Get signature display text (defaults to full name if not set)
 */
export function getSignatureText(
  signatureText: string | null,
  firstName: string,
  lastName: string
): string {
  return signatureText || `${firstName} ${lastName}`;
}

/**
 * Get signature font (defaults to Great Vibes if not set)
 */
export function getSignatureFont(font: SignatureFont | null): SignatureFont {
  return font || DEFAULT_SIGNATURE_FONT;
}

/**
 * Get CSS class for signature font
 */
export function getSignatureFontClass(font: SignatureFont | null): string {
  const validFont = getSignatureFont(font);
  return SIGNATURE_FONT_CLASSES[validFont];
}

