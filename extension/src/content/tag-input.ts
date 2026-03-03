type OnTagsChange = (nextTags: string[]) => void;

const TAG_STORAGE_KEY = 'gm-inspector-tags';

export class TagInput {
  private readonly container: HTMLDivElement;
  private readonly chipArea: HTMLDivElement;
  private readonly input: HTMLInputElement;
  private readonly addButton: HTMLButtonElement;
  private readonly datalist: HTMLDataListElement;
  private readonly tags = new Set<string>();

  private readonly onTagsChange?: OnTagsChange;

  constructor(container: HTMLDivElement, onTagsChange?: OnTagsChange) {
    this.container = container;
    this.onTagsChange = onTagsChange;

    const chipArea = document.createElement('div');
    chipArea.className = 'gm-action-list';
    this.chipArea = chipArea;

    const inputShell = document.createElement('div');
    inputShell.className = 'gm-tag-input-shell';

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = '#';
    input.autocomplete = 'off';
    input.maxLength = 40;

    const addButton = document.createElement('button');
    addButton.type = 'button';
    addButton.textContent = '+';
    addButton.className = 'gm-tag-add-btn';
    addButton.setAttribute('aria-label', '태그 추가');
    this.addButton = addButton;

    const datalist = document.createElement('datalist');
    const datalistId = `gm-panel-tag-options-${Date.now()}`;
    datalist.id = datalistId;
    input.setAttribute('list', datalistId);
    this.datalist = datalist;

    inputShell.appendChild(input);
    inputShell.appendChild(addButton);
    inputShell.appendChild(datalist);
    this.input = input;

    inputShell.appendChild(input);
    inputShell.appendChild(addButton);
    this.container.appendChild(chipArea);
    this.container.appendChild(inputShell);
    this.container.appendChild(datalist);

    addButton.addEventListener('click', () => {
      this.addTag();
    });

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        this.addTag();
      }
    });

    void this.loadStoredTags();
  }

  public reset(): void {
    this.setTags([]);
  }

  public getTags(): string[] {
    return [...this.tags];
  }

  public setTags(nextTags: string[]): void {
    this.tags.clear();
    nextTags.forEach((tag) => {
      const normalized = this.normalize(tag);
      if (normalized) {
        this.tags.add(normalized);
      }
    });
    this.renderChips();
    this.notify();
  }

  private addTag(): void {
    const normalized = this.normalize(this.input.value);
    if (!normalized) {
      return;
    }

    if (this.tags.has(normalized)) {
      this.input.value = '';
      return;
    }

    this.tags.add(normalized);
    this.renderChips();
    this.input.value = '';
    this.notify();
    void this.persistTag(normalized);
  }

  private removeTag(tag: string): void {
    this.tags.delete(tag);
    this.renderChips();
    this.notify();
  }

  private renderChips(): void {
    this.chipArea.innerHTML = '';

    this.tags.forEach((tag) => {
      const chip = document.createElement('span');
      chip.className = 'gm-tag-chip';

      const label = document.createElement('span');
      label.textContent = `#${tag}`;

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'gm-tag-remove';
      remove.textContent = '×';
      remove.setAttribute('aria-label', `태그 ${tag} 삭제`);
      remove.addEventListener('click', () => {
        this.removeTag(tag);
      });

      chip.append(label, remove);
      this.chipArea.appendChild(chip);
    });
  }

  private normalize(value: string): string {
    return value.trim().replace(/^#/, '').toLowerCase();
  }

  private notify(): void {
    this.onTagsChange?.(this.getTags());
  }

  private async loadStoredTags(): Promise<void> {
    if (!chrome.storage || !chrome.storage.local) {
      return;
    }

    try {
      const result = await chrome.storage.local.get(TAG_STORAGE_KEY);
      const stored = result[TAG_STORAGE_KEY];
      if (!Array.isArray(stored)) {
        return;
      }

      stored.forEach((value) => {
        const normalized = this.normalize(String(value));
        if (normalized) {
          const option = document.createElement('option');
          option.value = normalized;
          this.datalist.appendChild(option);
        }
      });
    } catch {
      return;
    }
  }

  private async persistTag(tag: string): Promise<void> {
    if (!chrome.storage || !chrome.storage.local) {
      return;
    }

    try {
      const result = await chrome.storage.local.get(TAG_STORAGE_KEY);
      const stored = Array.isArray(result[TAG_STORAGE_KEY]) ? (result[TAG_STORAGE_KEY] as unknown[]) : [];
      const next = Array.from(new Set(stored.map((value) => this.normalize(String(value))).concat([tag])));
      await chrome.storage.local.set({ [TAG_STORAGE_KEY]: next });
      this.datalist.innerHTML = '';
      next.forEach((item) => {
        const option = document.createElement('option');
        option.value = item;
        this.datalist.appendChild(option);
      });
    } catch {
      return;
    }
  }
}
