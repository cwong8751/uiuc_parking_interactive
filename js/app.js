const DATA_URL = 'data/spaces.json';
const CAMPUS_CENTER = [40.1060, -88.2272];

const map = L.map('map').setView(CAMPUS_CENTER, 15);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

const TYPE_COLORS = { permit: '#1e88e5', meter: '#43a047' };

const modal = M.Modal.init(document.getElementById('space-modal'));
const markers = new Map(); // id -> Leaflet marker
let spaces = [];

function markerStyle(type, state) {
  const base = { radius: 9, color: '#fff', weight: 2, fillColor: TYPE_COLORS[type], fillOpacity: 0.95, opacity: 1 };
  if (state === 'match') return { ...base, radius: 13, fillColor: '#ffb300' };
  if (state === 'dim') return { ...base, fillOpacity: 0.2, opacity: 0.3 };
  return base;
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function hasCapacity(s) {
  return Number.isInteger(s['max-capacity']);
}

// latlong may be "lat, lng" (string) or [lat, lng]
function parseLatLng(v) {
  return typeof v === 'string' ? v.split(',').map(Number) : v;
}

function openModal(space) {
  document.getElementById('modal-image').src = space.image;
  document.getElementById('modal-image').alt = space.location;
  document.getElementById('modal-location').textContent = space.location;
  document.getElementById('modal-type').textContent = space.type;
  document.getElementById('modal-capacity').textContent = hasCapacity(space) ? `Max capacity: ${space['max-capacity']}` : '';
  document.getElementById('modal-description').textContent = space.description;
  modal.open();
}

function renderMarkers() {
  spaces.forEach(s => {
    const m = L.circleMarker(s.latlong, markerStyle(s.type)).addTo(map).bindTooltip(s.location);
    m.on('click', () => openModal(s));
    markers.set(s.id, m);
  });
}

function renderList(visible) {
  const list = document.getElementById('list');
  list.innerHTML = visible.map(s => `
    <div class="col s12 m6 l4">
      <div class="card medium hoverable" data-id="${s.id}">
        <div class="card-image"><img src="${escapeHtml(s.image)}" alt="${escapeHtml(s.location)}" loading="lazy"></div>
        <div class="card-content">
          <span class="card-title">${escapeHtml(s.location)}</span>
          <span class="new badge ${s.type === 'permit' ? 'blue' : 'green'}" data-badge-caption="">${escapeHtml(s.type)}</span>
          ${hasCapacity(s) ? `<p><b>Max capacity:</b> ${s['max-capacity']}</p>` : ''}
          <p>${escapeHtml(s.description)}</p>
        </div>
      </div>
    </div>`).join('');
  document.getElementById('count').textContent = `(${visible.length})`;
  document.getElementById('empty').classList.toggle('hide', visible.length > 0);
  list.querySelectorAll('.card').forEach(card => {
    card.addEventListener('click', () => {
      const s = spaces.find(x => x.id === Number(card.dataset.id));
      map.setView(s.latlong, 17);
      openModal(s);
    });
  });
}

function applyFilter() {
  const q = document.getElementById('search').value.trim().toLowerCase();
  const types = new Set(['permit', 'meter'].filter(t => document.getElementById('filter-' + t).checked));
  const visible = spaces.filter(s => types.has(s.type) && (!q || [s.location, s.description, s.type].some(f => f.toLowerCase().includes(q))));
  const ids = new Set(visible.map(s => s.id));
  spaces.forEach(s => {
    const state = !ids.has(s.id) ? 'dim' : (q ? 'match' : '');
    const m = markers.get(s.id);
    m.setStyle(markerStyle(s.type, state));
    if (state === 'match') m.bringToFront();
  });
  renderList(visible);
  if (q && visible.length) map.fitBounds(L.latLngBounds(visible.map(s => s.latlong)), { padding: [40, 40], maxZoom: 17 });
}

let userMarker = null;

function locateUser(center) {
  if (!navigator.geolocation) return M.toast({ html: 'Geolocation is not supported.' });
  navigator.geolocation.getCurrentPosition(pos => {
    const ll = [pos.coords.latitude, pos.coords.longitude];
    if (userMarker) userMarker.setLatLng(ll);
    else userMarker = L.circleMarker(ll, { radius: 8, color: '#fff', weight: 2, fillColor: '#e53935', fillOpacity: 1 })
      .addTo(map).bindPopup('You are here');
    if (center) map.setView(ll, 17);
  }, () => M.toast({ html: 'Location unavailable. Showing campus map.' }), { timeout: 10000 });
}

const LocateControl = L.Control.extend({
  options: { position: 'bottomright' },
  onAdd() {
    const btn = L.DomUtil.create('a', 'btn-floating white waves-effect');
    btn.href = '#';
    btn.title = 'Center map on my location';
    btn.setAttribute('aria-label', 'Center map on my location');
    btn.innerHTML = '<i class="material-icons black-text">my_location</i>';
    L.DomEvent.disableClickPropagation(btn);
    L.DomEvent.on(btn, 'click', e => {
      L.DomEvent.preventDefault(e);
      if (userMarker) map.setView(userMarker.getLatLng(), 17);
      else locateUser(true);
    });
    return btn;
  }
});
map.addControl(new LocateControl());

fetch(DATA_URL)
  .then(r => r.json())
  .then(data => {
    spaces = data.map(s => ({ ...s, latlong: parseLatLng(s.latlong) }));
    map.fitBounds(L.latLngBounds(spaces.map(s => s.latlong)), { padding: [40, 40] });
    renderMarkers();
    renderList(spaces);
    ['search', 'filter-permit', 'filter-meter'].forEach(id =>
      document.getElementById(id).addEventListener('input', applyFilter));
    locateUser();
  })
  .catch(() => M.toast({ html: 'Failed to load parking data.' }));

window.addEventListener('resize', () => map.invalidateSize());
