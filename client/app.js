// YOUR JAVASCRIPT CODE FOR INDEX.HTML GOES HERE
// ─────────────────────────────────────────────
// Catalyst Web Client — Logistics App
// Calls AppSail backend API
// ─────────────────────────────────────────────

const API_BASE = 'https://logistics-appsail-30041044164.development.catalystappsail.eu';   // Catalyst AppSail route prefix

// ── Utility: Show notification banner ──
function showNotification(message, type = 'success') {
  const el = document.getElementById('notification');
  el.textContent = message;
  el.className = `notification ${type}`;
  setTimeout(() => { el.className = 'notification hidden'; }, 6000);
}

// ── Submit Shipment Form ──
document.getElementById('shipmentForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const btn = document.getElementById('submitBtn');
  btn.disabled = true;
  btn.textContent = 'Submitting…';

  const payload = {
    senderName:       document.getElementById('senderName').value.trim(),
    senderEmail:      document.getElementById('senderEmail').value.trim(),
    recipientName:    document.getElementById('recipientName').value.trim(),
    recipientAddress: document.getElementById('recipientAddress').value.trim(),
    origin:           document.getElementById('origin').value.trim(),
    destination:      document.getElementById('destination').value.trim(),
    weightKg:         parseFloat(document.getElementById('weightKg').value),
    shipmentType:     document.getElementById('shipmentType').value,
  };

  try {
    const response = await fetch(`${API_BASE}/api/shipments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    if (!response.ok) throw new Error(result.details || result.error || 'Server error');

    showNotification(
      `✅ Shipment submitted! Tracking: ${result.trackingNumber} — File transferred to SFTP.`,
      'success'
    );
    e.target.reset();
    loadShipments(); // Refresh table

  } catch (err) {
    showNotification(`❌ Error: ${err.message}`, 'error');
    console.error(err);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Submit Shipment';
  }
});

// ── Load Recent Shipments ──
async function loadShipments() {
  const container = document.getElementById('shipmentsTable');
  container.innerHTML = '<p style="color:#888;margin-top:10px">Loading…</p>';

  try {
    const res  = await fetch(`${API_BASE}/api/shipments`);
    const data = await res.json();

    if (!data.rows || data.rows.length === 0) {
      container.innerHTML = '<p style="color:#888;margin-top:10px">No shipments yet.</p>';
      return;
    }

    const rows = data.rows.map(r => `
      <tr>
        <td>${r.TRACKING_NUMBER}</td>
        <td>${r.SENDER_NAME}</td>
        <td>${r.RECIPIENT_NAME}</td>
        <td>${r.ORIGIN} → ${r.DESTINATION}</td>
        <td>${r.WEIGHT_KG} kg</td>
        <td>${r.SHIPMENT_TYPE}</td>
        <td><span class="badge badge-${r.STATUS.toLowerCase()}">${r.STATUS}</span></td>
        <td style="font-size:0.75rem;color:#888">${r.SFTP_FILENAME || '—'}</td>
      </tr>
    `).join('');

    container.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Tracking #</th><th>Sender</th><th>Recipient</th>
            <th>Route</th><th>Weight</th><th>Type</th>
            <th>Status</th><th>SFTP File</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;

  } catch (err) {
    container.innerHTML = `<p style="color:red">Failed to load: ${err.message}</p>`;
  }
}

// Auto-load on page open
loadShipments();