/**
 * Tool label generation — maps tool names to human-readable status messages.
 *
 * Uses pattern matching for common tool name patterns,
 * with a fallback to "Running {toolName}...".
 */

const TOOL_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /search|lookup|find|query|fetch/i, label: 'Searching...' },
  { pattern: /schedule|book|reserve/i, label: 'Scheduling...' },
  { pattern: /send|email|notify|message/i, label: 'Sending...' },
  { pattern: /create|generate|build|make/i, label: 'Creating...' },
  { pattern: /calculate|compute|analyze/i, label: 'Calculating...' },
  { pattern: /update|edit|modify|patch/i, label: 'Updating...' },
  { pattern: /delete|remove|clear/i, label: 'Removing...' },
  { pattern: /upload|import/i, label: 'Uploading...' },
  { pattern: /download|export/i, label: 'Downloading...' },
  { pattern: /check|verify|validate/i, label: 'Checking...' },
  { pattern: /navigate|redirect|route/i, label: 'Navigating...' },
];

/**
 * Get a human-readable label for a tool call.
 *
 * @param toolName - The tool name from the SSE event
 * @param toolLabels - Custom label overrides from the widget props
 * @returns The display label, or empty string if the tool should be hidden
 */
export function getToolLabel(
  toolName: string,
  toolLabels?: Record<string, string>,
): string {
  // Custom label takes priority
  if (toolLabels && toolName in toolLabels) {
    return toolLabels[toolName];
  }

  // Pattern matching for common tool names
  for (const { pattern, label } of TOOL_PATTERNS) {
    if (pattern.test(toolName)) {
      return label;
    }
  }

  // Fallback: humanize the tool name
  const humanized = toolName.replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return `Running ${humanized}...`;
}

/**
 * Get a parallel tool calls label.
 * Shows first tool's label when 1, "Running N tasks..." when > 1.
 */
export function getParallelToolLabel(
  activeCount: number,
  firstToolName: string,
  toolLabels?: Record<string, string>,
): string {
  if (activeCount <= 1) {
    return getToolLabel(firstToolName, toolLabels);
  }
  return `Running ${activeCount} tasks...`;
}
