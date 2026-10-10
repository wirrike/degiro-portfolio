/**
 * Escape XML text and attributes; reject characters that XML 1.0 cannot represent.
 * @param {string} text
 * @returns {string}
 */
export function escapeXml(text) {
  if (!text.isWellFormed() || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/u.test(text)) {
    throw new Error('Text contains characters that cannot be represented in XML 1.0.');
  }
  return text.replace(/[&<>"']/gu, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
  })[character]);
}

/** @param {string} content @returns {string} */
export const xmlDocument = (content) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${content}`;
