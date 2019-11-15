import { MatchProps, ObserverProps } from './interfaces';
import MatchObject from './MatchObject';
import DataSet from './DataSet';
import {
  getRcId,
  queryValueNodes,
  upFirstValueNode,
  RcIdAttrName,
  LinkedRcIdPropName
} from './utilities';

class MatchObserver {
  private _currentRoot: Node;
  private _mutationObserver: MutationObserver;
  private _matchesSet: DataSet<MatchObject[]>;
  private _mouseenterHandler: EventListener;
  private _mouseleaveHandler: EventListener;
  private _mousemoveHandler: EventListener;
  private _changeHandler: EventListener;
  private _lastHovered: MatchObject;

  constructor(private props: ObserverProps) {
    if (!this.props.matcher) {
      throw new Error('Prop [matcher] is required');
    }
    if (!this.props.hover) {
      throw new Error('Prop [hover] is required');
    }
    this._matchesSet = new DataSet<MatchObject[]>();
    // event handlers
    // ev.target is what triggers the event dispatcher to trigger
    // ev.currentTarget is what you assigned your listener to
    this._mouseenterHandler = (ev: MouseEvent) => {
      if (ev.target === ev.currentTarget) {
        this._buildRect(ev.target as Element);
      }
    };
    this._mouseleaveHandler = (ev: MouseEvent) => {
      if (ev.target === ev.currentTarget) {
        this._hideHovered(ev.target as Element);
      }
    };
    this._mousemoveHandler = (ev: MouseEvent) => {
      if (ev.target === ev.currentTarget) {
        this._matchRect(ev.target as Element, ev);
      }
    };
    this._changeHandler = (ev: Event) => {
      if (ev.target === ev.currentTarget) {
        this._observeValueNode(ev.target as Element);
      }
    };
  }

  observe(node: Node) {
    if (this._currentRoot) {
      throw new Error('Observer is running');
    }
    this._observeMutation(node);
    this._bindValueNodes(node);
    this._searchMatches(node);
    this._currentRoot = node;
  }

  private _searchMatches(node: Node, children: boolean = true) {
    if (!node) {
      throw new Error('[node] is required');
    }
    const matched = this._proceedMatch(node, children);
    if (matched) {
      matched.forEach(match => {
        this.addMatch(match);
      });
    }
  }

  private _proceedMatch(node: Node, children: boolean = true): MatchProps[] {
    const matched = this.props.matcher(node, children);
    return matched;
  }

  addMatch(matchProps: MatchProps | MatchObject): MatchObject {
    if (!matchProps) {
      throw new Error('[matchProps] is required');
    }
    const match =
      matchProps instanceof MatchObject
        ? matchProps
        : new MatchObject(matchProps);
    const target = match.getEventTarget();
    // cache matches
    const matches = this._matchesSet.get(target, []);
    matches.push(match); //TODO: duplicate risk
    this._matchesSet.set(target, matches);
    // attach events
    this._removeNodeEvents(target);
    this._addNodeEvents(target);
    // ret
    return match;
  }

  removeMatch(match: MatchObject) {
    if (!match) {
      throw new Error('[match] is required');
    }
    const target = match.getEventTarget();
    let matches = this._matchesSet.get(target);
    if (matches) {
      matches = matches.filter(x => x !== match);
      if (matches.length) {
        this._matchesSet.set(target, matches);
      } else {
        this._removeNodeEvents(target);
        this._matchesSet.remove(target);
        target.removeAttribute(RcIdAttrName);
      }
    }
  }

  stripMatches(node: Node, children: boolean = true) {
    if (!node) {
      throw new Error('[node] is required');
    }
    const treeWalker = document.createTreeWalker(node, NodeFilter.SHOW_ALL);
    let current = treeWalker.currentNode;
    while (current) {
      const linkedRcId = current[LinkedRcIdPropName];
      if (linkedRcId) {
        // unlink
        delete current[LinkedRcIdPropName];
        // find target
        let target: Element;
        const selector = `[${RcIdAttrName}="${linkedRcId}"]`;
        if (node instanceof Element) {
          target = node.querySelector(selector);
          if (!target && getRcId(node, false) === linkedRcId) {
            target = node;
          }
        }
        if (!target) {
          target = document.querySelector(selector);
        }
        // remove matchs
        if (target) {
          const matches = this._matchesSet.get(target);
          if (matches) {
            matches
              .filter(match => {
                return match.contains(current);
              })
              .forEach(match => {
                this.removeMatch(match);
              });
          }
        }
      }
      if (!children) {
        break;
      }
      current = treeWalker.nextNode();
    }
  }

  // https://api.jquery.com/mouseenter/
  private _addNodeEvents(node: Element) {
    node.addEventListener('mouseenter', this._mouseenterHandler);
    node.addEventListener('mouseleave', this._mouseleaveHandler);
    node.addEventListener('mousemove', this._mousemoveHandler);
  }

  private _removeNodeEvents(node: Element) {
    node.removeEventListener('mouseenter', this._mouseenterHandler);
    node.removeEventListener('mouseleave', this._mouseleaveHandler);
    node.removeEventListener('mousemove', this._mousemoveHandler);
  }

  private _bindValueNodes(node: Node) {
    if (node instanceof Element) {
      const valueNodes = queryValueNodes(node);
      valueNodes.forEach(node => {
        node.addEventListener('change', this._changeHandler);
      });
    }
  }

  private _unbindValueNodes(node: Node) {
    if (node instanceof Element) {
      const valueNodes = queryValueNodes(node);
      valueNodes.forEach(node => {
        node.removeEventListener('change', this._changeHandler);
      });
    }
  }

  private _buildRect(target: Element) {
    const matches = this._matchesSet.get(target);
    if (matches) {
      matches.forEach(match => {
        match.buildRect();
      });
    }
  }

  private _matchRect(target: Element, ev: MouseEvent) {
    const matches = this._matchesSet.get(target);
    if (matches) {
      const hovered = matches.find(m => {
        return m.isMatch(ev.x, ev.y);
      });
      if (hovered) {
        this._showHovered(target, hovered);
      } else {
        this._hideHovered(target);
      }
    }
  }

  private _showHovered(target: Element, hovered: MatchObject) {
    if (!this._lastHovered || this._lastHovered !== hovered) {
      this._lastHovered = hovered;
      this.props.hover(target, hovered);
    }
  }

  private _hideHovered(target: Element) {
    if (this._lastHovered) {
      this._lastHovered = null;
      this.props.hover(target);
    }
  }

  private _observeMutation(node: Node) {
    this._mutationObserver = new MutationObserver(mutationsList => {
      mutationsList.forEach(mutations => {
        switch (mutations.type) {
          case 'characterData':
            // here the 'target' is always a text node
            const valueNode1 = upFirstValueNode(mutations.target.parentNode);
            if (valueNode1) {
              this._observeValueNode(valueNode1);
            } else {
              this.stripMatches(mutations.target);
              this._searchMatches(mutations.target);
            }
            break;

          case 'attributes':
            // re-build the 'target' node's matches. its children is not need
            const valueNode2 = upFirstValueNode(mutations.target.parentNode);
            if (valueNode2) {
              this._observeValueNode(valueNode2);
            } else {
              this.stripMatches(mutations.target, false);
              this._searchMatches(mutations.target, false);
            }
            break;

          case 'childList':
            // here the 'target' is the parent of node being removed/added
            const valueNode3 = upFirstValueNode(mutations.target);
            if (valueNode3) {
              this._observeValueNode(valueNode3);
            } else {
              mutations.removedNodes.forEach(node => {
                this._unbindValueNodes(node);
                this.stripMatches(node);
              });
              mutations.addedNodes.forEach(node => {
                this._bindValueNodes(node);
                this._searchMatches(node);
              });
            }
            break;

          default:
            break;
        }
      });
    });
    this._mutationObserver.observe(node, {
      attributeFilter: this.props.attributeFilter,
      attributes: !!this.props.attributeFilter,
      characterData: true,
      childList: true,
      subtree: true
    });
  }

  private _observeValueNode(node: Element) {
    const matched = this._proceedMatch(node);
    const matches = this._matchesSet.get(node);
    const hasMatched = matched && matched.length > 0;
    const hasMatches = matches && matches.length > 0;
    if (hasMatched !== hasMatches) {
      if (hasMatched) {
        matched.forEach(match => {
          this.addMatch(match);
        });
      } else {
        this.stripMatches(node);
      }
    }
  }

  disconnect() {
    this._mutationObserver.disconnect();
    this.stripMatches(this._currentRoot);
    this._unbindValueNodes(this._currentRoot);
    this._matchesSet.clear();
    this._currentRoot = null;
  }
}

export default MatchObserver;