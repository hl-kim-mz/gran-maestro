export const INLINE_PANEL_STYLES = `
  :host {
    position: fixed;
    pointer-events: none;
    z-index: 2147483647;
  }

  .gm-inline-panel {
    pointer-events: auto;
    width: min(340px, 92vw);
    background: #1e1e1e;
    color: #e8e8e8;
    border: 1px solid #3c3c3c;
    border-radius: 4px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    padding: 8px;
    box-sizing: border-box;
    font-family: Menlo, Consolas, monospace;
    font-size: 12px;
    display: grid;
    gap: 6px;
  }

  .gm-inline-panel textarea,
  .gm-inline-panel input {
    width: 100%;
    box-sizing: border-box;
    border: 1px solid #3c3c3c;
    background: #252525;
    color: inherit;
    border-radius: 2px;
    padding: 4px 6px;
    font-size: 12px;
  }

  .gm-inline-panel textarea {
    resize: vertical;
    min-height: 56px;
    font-family: inherit;
    font-size: 12px;
  }

  .gm-path,
  .gm-selector {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    padding: 4px 6px;
    border: 1px solid #3c3c3c;
    background: #252525;
    border-radius: 2px;
  }

  .gm-path {
    color: #a8a8a8;
  }

  .gm-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
    margin-top: 2px;
  }

  .gm-action-btn {
    padding: 6px 8px;
    border-radius: 2px;
    border: 1px solid #3c3c3c;
    background: transparent;
    color: inherit;
    cursor: pointer;
    font-family: Menlo, Consolas, monospace;
    font-size: 12px;
  }

  .gm-action-btn:focus-visible,
  .gm-tag-chip:focus-visible,
  .gm-action-list textarea:focus-visible {
    outline: 1px solid #0078d4;
    outline-offset: 1px;
  }

  .gm-action-immediate {
    background: #0078d4;
    color: #ffffff;
    border-color: #0078d4;
  }

  .gm-action-queue {
    background: #3c3c3c;
  }

  .gm-action-list {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }

  .gm-tag-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: #2f2f2f;
    border: 1px solid #3c3c3c;
    border-radius: 10px;
    padding: 2px 6px;
    font-size: 11px;
    color: #d2d2d2;
  }

  .gm-tag-remove {
    border: none;
    background: transparent;
    color: #b0b0b0;
    cursor: pointer;
    font-size: 12px;
    line-height: 1;
    padding: 0;
  }

  .gm-tag-input-shell {
    display: flex;
    gap: 6px;
    align-items: center;
  }

  .gm-tag-input-shell input {
    flex: 1;
    min-width: 0;
    font-family: inherit;
  }

  .gm-tag-add-btn {
    width: 26px;
    height: 26px;
    border-radius: 2px;
    border: 1px solid #3c3c3c;
    background: #303030;
    color: #f0f0f0;
    cursor: pointer;
    font-family: Menlo, Consolas, monospace;
    padding: 0;
  }

  .gm-divider {
    height: 1px;
    background: #3c3c3c;
    width: 100%;
  }

  @media (prefers-color-scheme: light) {
    .gm-inline-panel {
      background: #ffffff;
      color: #333333;
      border-color: #d8d8d8;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
    }

    .gm-inline-panel textarea,
    .gm-inline-panel input,
    .gm-path,
    .gm-selector {
      background: #f5f5f5;
      border-color: #d8d8d8;
      color: #333333;
    }

    .gm-path {
      color: #444;
    }

    .gm-action-queue {
      background: #f0f0f0;
      color: #333333;
    }

    .gm-action-list {
      color: #333333;
    }

    .gm-tag-chip {
      background: #f0f0f0;
      color: #333333;
      border-color: #d8d8d8;
    }
  }
`;
