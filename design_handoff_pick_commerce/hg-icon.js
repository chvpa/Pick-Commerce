// <hg-icon name="PackageIcon" stroke="2"> — dibuja un ícono de @hugeicons/core-free-icons (el set que usa el Admin actual).
const NAMES = ['LayoutDashboardIcon','PackageIcon','CameraIcon','HourglassIcon','Comment01Icon','SparklesIcon','ReceiptTextIcon','PercentIcon','LayoutTemplateIcon','ChevronRightIcon','ChartNoAxesColumnIcon','UsersIcon','RepeatIcon','UsersRoundIcon','SettingsIcon','StoreIcon','UnfoldMoreIcon','PanelLeftIcon','ChevronDownIcon'];
const mod = import('https://esm.sh/@hugeicons/core-free-icons@4.3.0?exports=' + NAMES.join(',')).catch(() => ({}));
const NS = 'http://www.w3.org/2000/svg';
class HgIcon extends HTMLElement {
  static get observedAttributes() { return ['name', 'stroke']; }
  connectedCallback() { this.render(); }
  attributeChangedCallback() { this.render(); }
  async render() {
    const m = await mod;
    const data = m[this.getAttribute('name')];
    if (!data) { this.replaceChildren(); return; }
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.setAttribute('fill', 'none');
    svg.style.display = 'block';
    for (const [tag, attrs] of data) {
      const el = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) {
        if (k === 'key') continue;
        const n = k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
        el.setAttribute(n, n === 'stroke-width' ? (this.getAttribute('stroke') || '2') : v);
      }
      svg.appendChild(el);
    }
    this.replaceChildren(svg);
  }
}
if (!customElements.get('hg-icon')) customElements.define('hg-icon', HgIcon);
