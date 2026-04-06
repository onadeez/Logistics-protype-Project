const SftpClient = require('ssh2-sftp-client');
const fs = require('fs');
const path = require('path');

const REMOTE_DIR = process.env.SFTP_REMOTE_DIR || '/uploads';

function getSftpConfig() {
  if (!process.env.SFTP_PASSWORD) {
    throw new Error('SFTP_PASSWORD is required (no key fallback configured)');
  }

  return {
    host: process.env.SFTP_HOST,
    port: parseInt(process.env.SFTP_PORT || '22', 10),
    username: process.env.SFTP_USER,
    password: process.env.SFTP_PASSWORD,
    readyTimeout: 20000,
  };
}

function csvEscape(value) {
  const str = String(value ?? '');
  return `"${str.replace(/"/g, '""')}"`;
}

function buildShipmentCsv(shipmentPayload) {
  const headers = [
    'trackingNumber',
    'rowId',
    'senderName',
    'senderEmail',
    'origin',
    'recipientName',
    'recipientAddress',
    'destination',
    'weightKg',
    'shipmentType',
    'status',
    'generatedAt',
  ];

  const values = [
    shipmentPayload.trackingNumber,
    shipmentPayload.rowId,
    shipmentPayload.sender?.name,
    shipmentPayload.sender?.email,
    shipmentPayload.sender?.origin,
    shipmentPayload.recipient?.name,
    shipmentPayload.recipient?.address,
    shipmentPayload.recipient?.destination,
    shipmentPayload.shipment?.weightKg,
    shipmentPayload.shipment?.type,
    shipmentPayload.status,
    shipmentPayload.generatedAt,
  ];

  return `${headers.join(',')}\n${values.map(csvEscape).join(',')}\n`;
}

async function transferShipmentFile(shipmentPayload, logger) {
  const sftp = new SftpClient('logistics-sftp');

  const filename = `shipment_${shipmentPayload.trackingNumber}_${Date.now()}.csv`;
  const localPath = path.join('/tmp', filename);
  const content = buildShipmentCsv(shipmentPayload);

  fs.writeFileSync(localPath, content, 'utf8');
  logger.info(`Temp CSV file created: ${localPath} (${Buffer.byteLength(content)} bytes)`);

  try {
    const config = getSftpConfig();
    logger.info(`SFTP config check: host=${config.host}, port=${config.port}, user=${config.username}, remoteDir=${REMOTE_DIR}`);

    await sftp.connect(config);
    logger.info('SFTP connected successfully');

    const dirExists = await sftp.exists(REMOTE_DIR);
    logger.info(`Remote dir exists result for ${REMOTE_DIR}: ${dirExists}`);

    if (!dirExists) {
      logger.info(`Creating remote directory: ${REMOTE_DIR}`);
      await sftp.mkdir(REMOTE_DIR, true);
    }

    const remotePath = `${REMOTE_DIR}/${filename}`;
    logger.info(`Uploading ${localPath} to ${remotePath}`);

    await sftp.put(localPath, remotePath);
    logger.info(`File uploaded to: ${remotePath}`);

    const remoteStats = await sftp.stat(remotePath);
    const localSize = fs.statSync(localPath).size;

    if (remoteStats.size !== localSize) {
      throw new Error(`Size mismatch — local: ${localSize} bytes, remote: ${remoteStats.size} bytes`);
    }

    logger.info(`Transfer verified. Size: ${remoteStats.size} bytes`);
    return filename;
  } catch (err) {
    logger.error(`SFTP transfer error: ${err.stack || err.message}`);
    throw err;
  } finally {
    try { await sftp.end(); } catch {}
    try { fs.unlinkSync(localPath); } catch {}
    logger.info('SFTP connection closed, temp file cleaned up.');
  }
}

module.exports = { transferShipmentFile };