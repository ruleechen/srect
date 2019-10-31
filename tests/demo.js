function processNode(node) {
  if (node.tagName === 'INPUT') {
    const numbers = libphonenumber.findNumbers(node.value, {
      v2: true
    });
    return numbers.map(item => {
      return {
        startsNode: node,
        startsAt: item.startsAt,
        endsNode: node,
        endsAt: item.endsAt,
        number: item.number
      };
    });
  }
  if (
    node.tagName === 'A' &&
    (node.matches('a[href^="tel:"]') || node.matches('a[href^="sms:"]'))
  ) {
    return [
      {
        startsNode: node.firstChild,
        startsAt: 0,
        endsNode: node.firstChild,
        endsAt: node.innerText.length,
        number: null
      }
    ];
  }
  if (node.nodeType === 3) {
    const text = node.textContent.trim();
    const numbers = libphonenumber.findNumbers(text, {
      v2: true
    });
    return numbers.map(item => {
      return {
        startsNode: node,
        startsAt: item.startsAt,
        endsNode: node,
        endsAt: item.endsAt,
        number: item.number
      };
    });
  }
  return null;
}

class MyRule extends selectionWalker.RuleBase {
  init(container) {
    const walker = document.createTreeWalker(
      container,
      NodeFilter.SHOW_ALL,
      null
    );
    let founds = [];
    let node = walker.nextNode();
    while (node) {
      const res = processNode(node);
      if (res && res.length) {
        founds = founds.concat(res);
      }
      node = walker.nextNode();
    }
    return founds;
  }
  apply(mutations) {}
}

class MyWidget extends selectionWalker.WidgetBase {
  render(root) {
    root.innerHTML = '<div style="border:1px solid #ccc">I am menu</div>';
  }
}

window.addEventListener('load', () => {
  const walker = new selectionWalker.Walker({
    container: document.body,
    widget: new MyWidget(),
    rule: new MyRule()
  });
  walker.start();
  window.swalker = walker;
});