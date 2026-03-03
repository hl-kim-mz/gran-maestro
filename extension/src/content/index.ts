import { MESSAGE_TYPES } from '../shared/constants';
import { InspectStatusMsg, ToggleInspectMsg } from '../shared/types';
import { isExtensionMessage, sendToBackground } from '../shared/messages';
import { Inspector } from './inspector';

const inspector = new Inspector({
  onSelect: (element) => {
    void element;
  }
});

function applyInspectMode(enabled: boolean): void {
  if (enabled) {
    inspector.activate();
  } else {
    inspector.deactivate();
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!isExtensionMessage(message)) {
    return false;
  }

  if (message.type === MESSAGE_TYPES.TOGGLE_INSPECT) {
    const typedMessage = message as ToggleInspectMsg;
    applyInspectMode(typedMessage.payload.enabled);

    const status: InspectStatusMsg = {
      type: MESSAGE_TYPES.INSPECT_STATUS,
      payload: {
        tabId: typedMessage.payload.tabId,
        enabled: typedMessage.payload.enabled
      }
    };

    sendResponse(status);
    void sendToBackground({ type: MESSAGE_TYPES.INSPECT_STATUS, payload: status.payload });
    return true;
  }

  return false;
});
