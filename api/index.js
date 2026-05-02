const serverless = require("serverless-http");
const app = require("../server/index");

module.exports = serverless(app);
