/**
 * There is deliberately no `trunkY`. Spec 2.5 listed one, but measurement
 * showed workflows use whatever vertical baseline their author chose, so the
 * formatter preserves each entry node's position and normalises only the
 * geometry relative to it. A global baseline would move every workflow that
 * simply starts somewhere else.
 */
export interface FormatOptions {
  /** x gap between consecutive main-path nodes. */
  spacing: number;
  /** y offset of the first branch arm from its decision node. */
  branchOffset: number;
  /** y offset of a sub-node below the node it feeds. */
  clawOffset: number;
  stickyPadding: { top: number; bottom: number };
  /**
   * Sticky geometry is opt-in: the corpus shows no derivable constant for
   * width or height, so resizing by default would churn every workflow.
   */
  stickies: boolean;
}

export const DEFAULT_OPTIONS: FormatOptions = {
  spacing: 192,
  branchOffset: 96,
  clawOffset: 176,
  stickyPadding: { top: 112, bottom: 60 },
  stickies: false,
};

export const resolveOptions = (partial: Partial<FormatOptions> = {}): FormatOptions => ({
  ...DEFAULT_OPTIONS,
  ...partial,
  stickyPadding: { ...DEFAULT_OPTIONS.stickyPadding, ...(partial.stickyPadding ?? {}) },
});
