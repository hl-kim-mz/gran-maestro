type InspectDirection = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight';

export class Navigator {
  private current: Element | null = null;

  setCurrent(target: Element | null): void {
    this.current = target;
  }

  getCurrent(): Element | null {
    return this.current;
  }

  move(direction: InspectDirection): Element | null {
    const next = this.getNextTarget(direction);
    if (next) {
      this.current = next;
    }
    return this.current;
  }

  private getNextTarget(direction: InspectDirection): Element | null {
    if (!this.current) {
      return null;
    }

    switch (direction) {
      case 'ArrowUp': {
        if (this.current === document.body) {
          return this.current;
        }
        if (this.current === document.documentElement) {
          return document.body;
        }

        const parent = this.current.parentElement;
        if (!parent) {
          return this.current;
        }
        if (parent === document.documentElement) {
          return document.body;
        }
        return parent;
      }

      case 'ArrowDown': {
        return this.current.firstElementChild || this.current;
      }
      case 'ArrowLeft': {
        return this.current.previousElementSibling || this.current;
      }
      case 'ArrowRight': {
        return this.current.nextElementSibling || this.current;
      }
      default:
        return this.current;
    }
  }
}
