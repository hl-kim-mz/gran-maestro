export const INSPECT_OVERLAY_BORDER_COLOR = '#4A90D9';
export const INSPECT_OVERLAY_BACKGROUND = 'rgba(74, 144, 217, 0.1)';
export const INSPECT_OVERLAY_Z_INDEX = 2147483647;
export const INSPECT_OVERLAY_MIN_SIZE = 8;
export const INSPECT_OVERLAY_HOST_ATTRIBUTE = 'data-gm-inspector-overlay';

export const INSPECT_OVERLAY_STYLES = `
  :host {
    position: absolute;
    width: 0;
    height: 0;
    top: 0;
    left: 0;
    pointer-events: none;
    z-index: ${INSPECT_OVERLAY_Z_INDEX};
  }

  .gm-inspector-box {
    position: absolute;
    border: 2px solid ${INSPECT_OVERLAY_BORDER_COLOR};
    background: ${INSPECT_OVERLAY_BACKGROUND};
    box-sizing: border-box;
    pointer-events: none;
  }
`;
