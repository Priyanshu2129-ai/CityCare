/* =========================================================
   Vercel serverless adapter for the CityCare backend.
   Exports the Express app so Vercel can run /api/* without a
   long-lived server. Sessions are stored in MongoDB (persistent),
   which is serverless-safe. The Mongoose connection is established
   lazily by the app's route handlers.
   ========================================================= */

module.exports = require('../server/server');