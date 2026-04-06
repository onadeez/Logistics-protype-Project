// ─────────────────────────────────────────────
// Route: /api/shipment  (POST)   — Submit new shipment
// Route: /api/shipments (GET)    — List recent shipments
// ─────────────────────────────────────────────

const express  = require('express');
const router   = express.Router();
const { transferShipmentFile } = require('./sftp');

const TABLE_NAME = 'SHIPMENTS';

// ── Helper: generate tracking number ──
function generateTrackingNumber() {
  const timestamp = Date.now().toString(36).toUpperCase();
  const rand      = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `TRK-${timestamp}-${rand}`;
}

// ─────────────────────────────────────────────
// POST /api/shipment
// 1. Validate input
// 2. Save to Catalyst Data Store
// 3. Transfer JSON file to SFTP
// 4. Update row status
// ─────────────────────────────────────────────
router.post('/shipments', async (req, res) => {
  const logger = req.app.locals.logger;

  // ── 1. Validate ──
  const { senderName, senderEmail, recipientName, recipientAddress,
          origin, destination, weightKg, shipmentType } = req.body;

  const required = { senderName, senderEmail, recipientName, recipientAddress,
                     origin, destination, weightKg, shipmentType };

  const missing = Object.entries(required)
    .filter(([, v]) => v === undefined || v === '' || v === null)
    .map(([k]) => k);

  if (missing.length) {
    return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
  }

  const trackingNumber = generateTrackingNumber();
  logger.info(`Processing new shipment: ${trackingNumber}`);

  // ── 2. Save to Data Store ──
  let savedRowId;
  try {
    const datastore = req.catalystApp.datastore();
    const table     = datastore.table(TABLE_NAME);

    const rowData = {
      TRACKING_NUMBER:   trackingNumber,
      SENDER_NAME:       senderName,
      SENDER_EMAIL:      senderEmail,
      RECIPIENT_NAME:    recipientName,
      RECIPIENT_ADDRESS: recipientAddress,
      ORIGIN:            origin,
      DESTINATION:       destination,
      WEIGHT_KG:         parseFloat(weightKg),
      SHIPMENT_TYPE:     shipmentType,
      STATUS:            'PENDING',
      SFTP_FILENAME:     '',
    };

  const inserted = await table.insertRow(rowData);
  logger.info(`Insert response: ${JSON.stringify(inserted)}`);

  savedRowId =
  inserted?.ROWID ||
  inserted?.data?.ROWID ||
  inserted?.row?.ROWID ||
  inserted?.row_id ||
  null;

 logger.info(`Resolved ROWID: ${savedRowId}`);

  } catch (dbErr) {
  logger.error(`Data Store insert failed: ${dbErr.stack || dbErr.message}`);
  return res.status(500).json({
    error: 'Failed to save shipment to Data Store',
    details: dbErr.message
  });
  }

  // ── 3. Transfer to SFTP ──
  const shipmentPayload = {
    trackingNumber,
    rowId: savedRowId,
    sender: { name: senderName, email: senderEmail, origin },
    recipient: { name: recipientName, address: recipientAddress, destination },
    shipment: { weightKg: parseFloat(weightKg), type: shipmentType },
    status: 'PENDING',
    generatedAt: new Date().toISOString(),
  };

  let sftpFilename = '';
  let finalStatus  = 'TRANSFERRED';

  try {
    sftpFilename = await transferShipmentFile(shipmentPayload, logger);
    logger.info(`SFTP transfer successful: ${sftpFilename}`);
  } catch (sftpErr) {
    logger.error(`SFTP transfer failed: ${sftpErr.message}`);
    finalStatus = 'FAILED';
    // Do NOT return error — still record the attempt
  }

  // ── 4. Update row with result ──
  if (savedRowId) {
  try {
    const datastore = req.catalystApp.datastore();
    const table = datastore.table(TABLE_NAME);

    await table.updateRow({
      ROWID: savedRowId,
      STATUS: finalStatus,
      SFTP_FILENAME: sftpFilename,
    });

    logger.info(`Row ${savedRowId} updated. Status: ${finalStatus}`);
  } catch (updateErr) {
    logger.error(`Row update failed: ${updateErr.stack || updateErr.message}`);
  }
}

  res.status(201).json({
    success:       true,
    trackingNumber,
    rowId:         savedRowId,
    sftpFilename,
    status:        finalStatus,
    message:       finalStatus === 'TRANSFERRED'
      ? 'Shipment saved and file transferred to SFTP successfully.'
      : 'Shipment saved but SFTP transfer failed. Check logs.',
  });
});

// ─────────────────────────────────────────────
// GET /api/shipments
// Retrieve last 50 shipments (newest first)
// ─────────────────────────────────────────────
router.get('/shipments', async (req, res) => {
  const logger = req.app.locals.logger;

  try {
    const datastore = req.catalystApp.datastore();
    const table     = datastore.table(TABLE_NAME);

    const result = await table.getAllRows();   // ✅ correct method

    res.json({
      rows: result.data || [],
      total: result.data ? result.data.length : 0,
    });

  } catch (err) {
    logger.error(`Failed to fetch shipments: ${err.message}`);
    res.status(500).json({
      error: 'Failed to retrieve shipments',
      details: err.message
    });
  }
});

module.exports = router;