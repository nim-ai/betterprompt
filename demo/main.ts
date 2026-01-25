/**
 * Demo page for betterprompt
 */

// Lucide icons global (loaded via CDN)
declare const lucide: { createIcons: () => void } | undefined;

import {
  mergeWithProgress,
  getSimpleDiff,
  initBrowser,
  isMLEmbeddingsActive,
  type MergeProgress,
  type MergeResult,
} from "../src/browser.js";

// DOM Elements
const baseV1El = document.getElementById("base-v1") as HTMLTextAreaElement;
const baseV2El = document.getElementById("base-v2") as HTMLTextAreaElement;
const userCustomEl = document.getElementById(
  "user-custom"
) as HTMLTextAreaElement;
const conflictStrategyEl = document.getElementById(
  "conflict-strategy"
) as HTMLSelectElement;
const mergeBtnEl = document.getElementById("merge-btn") as HTMLButtonElement;
const progressEl = document.getElementById("progress") as HTMLDivElement;
const progressFillEl = document.getElementById(
  "progress-fill"
) as HTMLDivElement;
const progressTextEl = document.getElementById(
  "progress-text"
) as HTMLSpanElement;
const resultEl = document.getElementById("result") as HTMLDivElement;
const statsEl = document.getElementById("stats") as HTMLDivElement;
const mergedOutputEl = document.getElementById(
  "merged-output"
) as HTMLTextAreaElement;
const conflictsEl = document.getElementById("conflicts") as HTMLDivElement;
const conflictListEl = document.getElementById(
  "conflict-list"
) as HTMLDivElement;
const diffFromPreferredEl = document.getElementById(
  "diff-from-preferred"
) as HTMLDivElement;
const diffFromPreferredTitleEl = document.getElementById(
  "diff-from-preferred-title"
) as HTMLHeadingElement;
const diffFromPreferredOutputEl = document.getElementById(
  "diff-from-preferred-output"
) as HTMLDivElement;
const copyBtnEl = document.getElementById("copy-btn") as HTMLButtonElement;

// 2-way merge elements
const currentPromptEl = document.getElementById(
  "current-prompt"
) as HTMLTextAreaElement;
const updatesPromptEl = document.getElementById(
  "updates-prompt"
) as HTMLTextAreaElement;
const twoWayConflictStrategyEl = document.getElementById(
  "two-way-conflict-strategy"
) as HTMLSelectElement;
const mergeUpdatesBtnEl = document.getElementById(
  "merge-updates-btn"
) as HTMLButtonElement;
const updatesResultEl = document.getElementById(
  "updates-result"
) as HTMLDivElement;
const updatesOutputEl = document.getElementById(
  "updates-output"
) as HTMLTextAreaElement;
const copyUpdatesBtnEl = document.getElementById(
  "copy-updates-btn"
) as HTMLButtonElement;
const updatesDiffOutputEl = document.getElementById(
  "updates-diff-output"
) as HTMLDivElement;

// Initialize
let initialized = false;

// Sync heights of the 3-way merge input textareas
function syncInputHeights(): void {
  const textareas = [baseV1El, baseV2El, userCustomEl];

  // Reset heights to auto to get natural content heights
  textareas.forEach((ta) => {
    ta.style.height = "auto";
  });

  // Find the tallest
  const maxHeight = Math.max(...textareas.map((ta) => ta.scrollHeight));

  // Set all to the tallest height
  textareas.forEach((ta) => {
    ta.style.height = `${maxHeight}px`;
  });
}

// Sync heights on input
[baseV1El, baseV2El, userCustomEl].forEach((ta) => {
  ta.addEventListener("input", syncInputHeights);
});

// Initial sync after content loads
requestAnimationFrame(syncInputHeights);

// Sync heights of the 2-way merge input textareas
function syncUpdatesInputHeights(): void {
  const textareas = [currentPromptEl, updatesPromptEl];

  textareas.forEach((ta) => {
    ta.style.height = "auto";
  });

  const maxHeight = Math.max(...textareas.map((ta) => ta.scrollHeight));

  textareas.forEach((ta) => {
    ta.style.height = `${maxHeight}px`;
  });
}

[currentPromptEl, updatesPromptEl].forEach((ta) => {
  ta.addEventListener("input", syncUpdatesInputHeights);
});

requestAnimationFrame(syncUpdatesInputHeights);

async function ensureInitialized(): Promise<void> {
  if (!initialized) {
    progressEl.style.display = "block";
    progressTextEl.textContent = "Loading embedding model (this is only needed once and improves quality)...";
    progressFillEl.style.width = "10%";

    try {
      await initBrowser();
      initialized = true;
    } catch (err) {
      console.warn("Failed to load embedding model, using fallback:", err);
      initialized = true;
    }

    // Show which embedding mode is active in the footer
    const footerEl = document.querySelector("footer p");
    if (footerEl) {
      const status = isMLEmbeddingsActive()
        ? '<span style="color: var(--success);">ML embeddings active</span>'
        : '<span style="color: var(--warning);">Using char-frequency fallback</span>';
      footerEl.innerHTML += ` &middot; ${status}`;
    }

    progressEl.style.display = "none";
  }
}

// Merge handler
mergeBtnEl.addEventListener("click", async () => {
  const baseV1 = baseV1El.value;
  const baseV2 = baseV2El.value;
  const userCustom = userCustomEl.value;

  if (!baseV1 || !baseV2 || !userCustom) {
    alert("Please fill in all three text areas.");
    return;
  }

  mergeBtnEl.disabled = true;
  progressEl.style.display = "block";
  resultEl.style.display = "none";

  try {
    await ensureInitialized();

    const conflictStrategy = conflictStrategyEl.value as
      | "prefer-a"
      | "prefer-b"
      | "prefer-c"
      | "defer"
      | "concatenate";

    console.log("=== MERGE DEBUG ===");
    console.log(
      "Embedding method:",
      isMLEmbeddingsActive() ? "ML (Model2Vec)" : "char-frequency fallback"
    );
    console.log("A (Base V1):", baseV1);
    console.log("B (Base V2):", baseV2);
    console.log("C (User Custom):", userCustom);
    console.log("Strategy:", conflictStrategy);

    const result = await mergeWithProgress(
      baseV1,
      baseV2,
      userCustom,
      (progress: MergeProgress) => {
        progressFillEl.style.width = `${progress.progress}%`;
        progressTextEl.textContent = progress.message;
      },
      { conflictStrategy }
    );

    console.log("Result:", result.merged);
    console.log("Stats:", result.stats);
    console.log("Conflicts:", result.conflicts);

    await displayMergeResult(
      result,
      conflictStrategy,
      baseV1,
      baseV2,
      userCustom
    );
  } catch (err) {
    console.error("Merge failed:", err);
    alert(
      `Merge failed: ${err instanceof Error ? err.message : "Unknown error"}`
    );
  } finally {
    mergeBtnEl.disabled = false;
    progressEl.style.display = "none";
  }
});

async function displayMergeResult(
  result: MergeResult,
  strategy: string,
  a: string,
  b: string,
  c: string
): Promise<void> {
  resultEl.style.display = "block";

  // Stats
  statsEl.innerHTML = `
    <div class="stat">
      <i data-lucide="equal"></i>
      <span>Unchanged:</span>
      <span class="stat-value">${result.stats.unchanged}</span>
    </div>
    <div class="stat">
      <i data-lucide="arrow-up-circle"></i>
      <span>Upgraded:</span>
      <span class="stat-value success">${result.stats.upgraded}</span>
    </div>
    <div class="stat">
      <i data-lucide="shield-check"></i>
      <span>Preserved:</span>
      <span class="stat-value success">${result.stats.preserved}</span>
    </div>
    <div class="stat">
      <i data-lucide="trash-2"></i>
      <span>Removed:</span>
      <span class="stat-value ${result.stats.removed > 0 ? "warning" : ""}">${result.stats.removed}</span>
    </div>
    <div class="stat">
      <i data-lucide="alert-triangle"></i>
      <span>Conflicts:</span>
      <span class="stat-value ${result.stats.conflicts > 0 ? "danger" : ""}">${result.stats.conflicts}</span>
    </div>
    <div class="stat">
      <i data-lucide="wand-2"></i>
      <span>Auto-resolved:</span>
      <span class="stat-value warning">${result.stats.autoResolved}</span>
    </div>
  `;

  // Re-initialize Lucide icons for dynamically added content
  if (typeof lucide !== "undefined") {
    lucide.createIcons();
  }

  // Show diff from preferred version (or from A for concatenate)
  // Skip diff for "defer" since it contains conflict markers
  let preferredText = "";
  let preferredLabel = "";

  if (strategy === "prefer-a") {
    preferredText = a;
    preferredLabel = "A";
  } else if (strategy === "prefer-b") {
    preferredText = b;
    preferredLabel = "B";
  } else if (strategy === "prefer-c") {
    preferredText = c;
    preferredLabel = "C";
  } else if (strategy === "concatenate") {
    // For concatenate, show diff from original (A)
    preferredText = a;
    preferredLabel = "A (original)";
  }
  // "defer" intentionally excluded - output has conflict markers

  if (preferredText && result.merged !== preferredText) {
    try {
      const diffs = await getSimpleDiff(preferredText, result.merged);
      diffFromPreferredTitleEl.textContent = `Changes from ${preferredLabel}:`;
      diffFromPreferredOutputEl.innerHTML = diffs
        .map((diff) => {
          const className = `diff-${diff.type}`;
          const content = escapeHtml(diff.content);

          if (diff.type === "modified" && diff.oldContent) {
            return `<span class="diff-removed">${escapeHtml(diff.oldContent)}</span><span class="diff-added">${content}</span>`;
          }

          return `<span class="${className}">${content}</span>`;
        })
        .join("");
      diffFromPreferredEl.style.display = "block";
    } catch {
      diffFromPreferredEl.style.display = "none";
    }
  } else {
    diffFromPreferredEl.style.display = "none";
  }

  // Merged output
  mergedOutputEl.value = result.merged;

  // Conflicts
  if (result.conflicts.length > 0) {
    conflictsEl.style.display = "block";
    conflictListEl.innerHTML = result.conflicts
      .map(
        (conflict) => `
      <div class="conflict-item">
        <h5>Conflict: ${conflict.id}</h5>
        <div class="conflict-content conflict-base">B (upgraded): ${escapeHtml(conflict.b)}</div>
        <div class="conflict-content conflict-user">C (user): ${escapeHtml(conflict.c)}</div>
      </div>
    `
      )
      .join("");
  } else {
    conflictsEl.style.display = "none";
  }
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Copy button handler
function setupCopyButton(
  btn: HTMLButtonElement,
  textarea: HTMLTextAreaElement
) {
  btn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(textarea.value);
      btn.textContent = "✓";
      btn.classList.add("copied");
      setTimeout(() => {
        btn.textContent = "📋";
        btn.classList.remove("copied");
      }, 2000);
    } catch {
      // Fallback for older browsers
      textarea.select();
      document.execCommand("copy");
      btn.textContent = "✓";
      btn.classList.add("copied");
      setTimeout(() => {
        btn.textContent = "📋";
        btn.classList.remove("copied");
      }, 2000);
    }
  });
}

setupCopyButton(copyBtnEl, mergedOutputEl);
setupCopyButton(copyUpdatesBtnEl, updatesOutputEl);

// Dynamic code examples
const threeWayStrategyCodeEl = document.getElementById(
  "three-way-strategy-code"
) as HTMLSpanElement;
const twoWayStrategyCodeEl = document.getElementById(
  "two-way-strategy-code"
) as HTMLSpanElement;

conflictStrategyEl.addEventListener("change", () => {
  threeWayStrategyCodeEl.textContent = `"${conflictStrategyEl.value}"`;
});

twoWayConflictStrategyEl.addEventListener("change", () => {
  twoWayStrategyCodeEl.textContent = `"${twoWayConflictStrategyEl.value}"`;
});

// 2-way merge handler
mergeUpdatesBtnEl.addEventListener("click", async () => {
  const currentPrompt = currentPromptEl.value;
  const updates = updatesPromptEl.value;

  if (!currentPrompt || !updates) {
    alert("Please fill in both text areas.");
    return;
  }

  mergeUpdatesBtnEl.disabled = true;

  try {
    await ensureInitialized();

    // In 2-way merge: A = empty, B = updates, C = current
    const conflictStrategy = twoWayConflictStrategyEl.value as
      | "prefer-b"
      | "prefer-c"
      | "defer"
      | "concatenate";

    // Use 3-way merge with empty ancestor to combine two prompts
    // A = empty (no common ancestor)
    // B = updates to apply
    // C = current prompt (preserve this)
    const result = await mergeWithProgress(
      "",
      updates,
      currentPrompt,
      () => {}, // No progress display for this simple merge
      { conflictStrategy }
    );

    updatesOutputEl.value = result.merged;
    updatesResultEl.style.display = "block";

    // Show diff from current prompt
    if (result.merged !== currentPrompt) {
      const diffs = await getSimpleDiff(currentPrompt, result.merged);
      updatesDiffOutputEl.innerHTML = diffs
        .map((diff) => {
          const className = `diff-${diff.type}`;
          const content = escapeHtml(diff.content);

          if (diff.type === "modified" && diff.oldContent) {
            return `<span class="diff-removed">${escapeHtml(diff.oldContent)}</span><span class="diff-added">${content}</span>`;
          }

          return `<span class="${className}">${content}</span>`;
        })
        .join("");
    }
  } catch (err) {
    console.error("Merge failed:", err);
    alert(
      `Merge failed: ${err instanceof Error ? err.message : "Unknown error"}`
    );
  } finally {
    mergeUpdatesBtnEl.disabled = false;
  }
});
