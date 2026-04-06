require('dotenv').config();
const express = require('express');
const catalyst = require('zcatalyst-sdk-node');
const winston = require('winston');

const shipmentRoutes = require('./routes/shipment');

const app = express();
const PORT = process.env.PORT || 9000;

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) =>
      `[${timestamp}] ${level.toUpperCase()}: ${message}`)
  ),
  transports: [new winston.transports.Console()],
});

app.locals.logger = logger;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  req.catalystApp = catalyst.initialize(req);
  next();
});

app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'logistics-appsail',
    timestamp: new Date().toISOString(),
  });
});

app.use('/api', shipmentRoutes);

app.use((err, req, res, next) => {
  logger.error(`Unhandled error: ${err.message}`);
  res.status(500).json({ error: 'Internal server error', details: err.message });
});

app.listen(PORT, '0.0.0.0', () => {
  logger.info(`AppSail server listening on port ${PORT}`);
});

module.exports = app;