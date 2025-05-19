/**
 * Document Utility functions
 * 
 * Provides helper functions for document processing and text extraction.
 */
const pdfParse = require('pdf-parse');

/**
 * Extract text content from a document buffer based on mime type
 * 
 * @param {Buffer} buf - Document buffer
 * @param {string} mime - MIME type of the document
 * @returns {Promise<string>} Extracted text content
 */
async function extractText(buf, mime) {
  switch (mime) {
    case 'text/plain':
    case 'text/markdown':
      return buf.toString('utf8');
    case 'application/pdf':
      try { const o = await pdfParse(buf); return o.text; }
      catch (e) { console.error('PDF parse error', e); return ''; }
    default:
      return '';
  }
}

module.exports = {
  extractText
}; 