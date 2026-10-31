// Quick Look runs JavaScript but does not expose persistent localStorage.
// iCIBA reads it during React startup, before attaching any click handlers.
export const previewCompatibility = `
(function () {
  ['localStorage', 'sessionStorage'].forEach(function (name) {
    try { if (window[name]) { window[name].getItem('wordping'); return; } } catch (_) {}
    var values = Object.create(null);
    Object.defineProperty(window, name, { configurable: true, value: {
      getItem: function (key) { return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null; },
      setItem: function (key, value) { values[key] = String(value); },
      removeItem: function (key) { delete values[key]; },
      clear: function () { values = Object.create(null); },
      key: function (index) { return Object.keys(values)[index] || null; },
      get length() { return Object.keys(values).length; }
    }});
  });
  // Next.js tries to replace the local preview URL with its remote base URL.
  var replace = history.replaceState;
  history.replaceState = function (state, title, url) {
    if (url && new URL(url, document.baseURI).origin !== location.origin) {
      return replace.call(history, state, title);
    }
    return replace.call(history, state, title, url);
  };
  var proxy = location.pathname.split('/')[1];
  function apiURL(value) {
    var url = new URL(value, document.baseURI);
    if (['service.iciba.com', 'dict.iciba.com'].indexOf(url.hostname) >= 0) {
      url.protocol = 'https:';
      return location.origin + '/' + proxy + '/api/' + btoa(url.href).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '');
    }
    return value;
  }
  var open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    var args = Array.prototype.slice.call(arguments); args[1] = apiURL(url);
    return open.apply(this, args);
  };
  var request = window.fetch;
  window.fetch = function (url, options) {
    return request.call(window, typeof url === 'string' ? apiURL(url) : url, options);
  };
})();`;

// The current upstream client removes Collins even when it is in __NEXT_DATA__.
// Preserve access to that supplied content without relying on React internals.
const dictionaryTabs = `
(function () {
  var data = JSON.parse(document.getElementById('__NEXT_DATA__').textContent);
  var word = data.props.pageProps.initialReduxState.word.wordInfo;
  var selected = 0;
  function text(value) { return String(value || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' '); }
  function add(parent, tag, value) {
    var node = document.createElement(tag); node.textContent = text(value); parent.appendChild(node); return node;
  }
  function install() {
    var original = document.querySelector('[class*="DicTab_tab__"]');
    if (!original || document.getElementById('wordping-tabs')) return;
    var nav = document.createElement('nav'); nav.id = 'wordping-tabs';
    ['简明词典', '柯林斯词典', 'AI释义', 'AI解词', '牛津词典'].forEach(function (label, index) {
      var button = add(nav, 'button', label); button.type = 'button';
      button.setAttribute('aria-pressed', String(index === selected));
      button.onclick = function () {
        selected = index;
        Array.from(nav.children).forEach(function (item, i) { item.setAttribute('aria-pressed', String(i === index)); });
        var fill = document.querySelector('[class*="Content_fill__"]');
        if (!fill) return;
        var panel = document.getElementById('wordping-dictionary-panel');
        if (!panel) { panel = document.createElement('section'); panel.id = 'wordping-dictionary-panel'; fill.parentNode.insertBefore(panel, fill); }
        panel.replaceChildren(); panel.hidden = true; fill.hidden = false;
        if (index === 0 || index === 2 || index === 3) {
          var label = index === 0 ? '简明' : index === 2 ? 'AI释义' : 'AI解词';
          var target = Array.from(document.querySelectorAll('[class*="DicTab_tab__"] li')).find(function (li) { return li.textContent.indexOf(label) >= 0; });
          if (target) { target.click(); return; }
        }
        fill.hidden = true; panel.hidden = false;
        add(panel, 'h2', word.baesInfo && word.baesInfo.word_name);
        add(panel, 'h3', ['简明词典', '柯林斯词典', 'AI释义', 'AI解词', '牛津词典'][index]);
        if (index === 1 && Array.isArray(word.collins) && word.collins.length) {
          word.collins.forEach(function (group) { (group.entry || []).forEach(function (entry) {
            add(panel, 'h4', [entry.posp, entry.tran].filter(Boolean).join(' · '));
            add(panel, 'p', entry.def);
            (entry.example || []).forEach(function (example) { add(panel, 'p', example.ex); add(panel, 'p', example.tran); });
          }); });
        } else {
          add(panel, 'p', '爱词霸暂未提供此内容。AI 内容可能仍在加载，可稍后重试。');
          var link = add(panel, 'a', '在爱词霸网站查看'); link.href = 'https://www.iciba.com/word?w=' + encodeURIComponent(data.props.pageProps.query.w);
        }
      };
    });
    original.parentNode.insertBefore(nav, original);
  }
  new MutationObserver(install).observe(document.getElementById('__next'), { childList: true, subtree: true });
  install();
})();`;

export function icibaPreviewHTML(html: string): string {
  const style = `<style>
    [class*="DicTab_tab__"]{display:none!important}
    #wordping-tabs{display:flex;gap:24px;flex-wrap:wrap;padding:28px 40px;background:white}
    #wordping-tabs button{font:inherit;font-size:20px;border:0;border-bottom:3px solid transparent;background:none;padding:12px 0;cursor:pointer;color:#666}
    #wordping-tabs button[aria-pressed=true]{color:#222;border-color:#50bfff;font-weight:600}
    #wordping-dictionary-panel{flex:1;padding:30px 40px;line-height:1.7;min-width:0;background:white}
    #wordping-dictionary-panel[hidden],[class*="Content_fill__"][hidden]{display:none!important}
    #wordping-dictionary-panel h2{font-size:36px}#wordping-dictionary-panel h4{margin-top:24px;font-weight:bold}
  </style>`;
  return html.replace('<head>', `<head><base href="https://www.iciba.com/"><script>${previewCompatibility}</script>${style}`)
    .replace(/http:\/\/(res[^/]*\.iciba\.com)\//g, 'https://$1/')
    .replace('</body>', `<script>${dictionaryTabs}</script></body>`);
}
