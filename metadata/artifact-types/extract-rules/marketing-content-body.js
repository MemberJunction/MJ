/**
 * Extracts the full body/content in markdown format for marketing content artifacts
 * Priority: content.body > copywriter.initialDraft > editor.revisedDraft
 */
(function(content) {
  try {
    const data = JSON.parse(content);

    // First priority: content.body
    if (data.content && data.content.body) {
      return data.content.body;
    }

    // Second priority: copywriter.initialDraft
    if (data.copywriter && data.copywriter.initialDraft) {
      return data.copywriter.initialDraft;
    }

    // Fallback: editor.revisedDraft
    if (data.editor && data.editor.revisedDraft) {
      return data.editor.revisedDraft;
    }

    return null;
  } catch (e) {
    return null;
  }
})(content);
