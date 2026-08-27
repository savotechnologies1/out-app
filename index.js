// Polyfill deprecated/removed util methods for compatibility with Node.js 24+ (e.g. simple-node-logger)
const util = require("util");
if (typeof util.isDate !== "function") {
  util.isDate = (object) => Object.prototype.toString.call(object) === "[object Date]";
}
if (typeof util.isArray !== "function") {
  util.isArray = Array.isArray;
}
if (typeof util.isRegExp !== "function") {
  util.isRegExp = (object) => Object.prototype.toString.call(object) === "[object RegExp]";
}
if (typeof util.isError !== "function") {
  util.isError = (object) => Object.prototype.toString.call(object) === "[object Error]" || object instanceof Error;
}

const express = require("express");
const path = require("path");
const connectDb = require("./config/dbConnection");
const cors = require("cors");
const dotenv = require("dotenv").config();
const fs = require("fs");
const helmet = require("helmet");
const errorHandler = require("./middleware/errorHandler");
const http = require("http");
const cron = require("node-cron");
const { releaseOnCheckIn, notifyOnCheckIn, autoCancelExpiredBookings } = require("./cron/working");

connectDb();
const app = express();
const server = http.createServer(app);
app.use(cors({}));

const port = process.env.PORT || 5000;

cron.schedule("0 * * * *", async () => {
  console.log("Running release cron...");
  await releaseOnCheckIn();
  await notifyOnCheckIn();
});

// Schedule auto-cancellation worker every 5 minutes
cron.schedule("*/5 * * * *", async () => {
  console.log("autocancel running")
  await autoCancelExpiredBookings();
});
require("./cron/pendingBookingCleanup");
require("./cron/couponExpire")
// app.use(helmet());
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);
app.use(express.json({ limit: "30mb" }));
app.use(express.urlencoded({ extended: true, limit: "30mb" }));
const directory = path.join(__dirname);

// app.use(express.static(directory));
app.use(
  "/uploads",
  express.static(
    path.join(__dirname, "uploads"),
    {
      setHeaders: (res, filePath) => {

        if (filePath.endsWith(".mp4")) {
          res.setHeader(
            "Content-Type",
            "video/mp4"
          );
        }

        if (filePath.endsWith(".mp3")) {
          res.setHeader(
            "Content-Type",
            "audio/mpeg"
          );
        }

        if (filePath.endsWith(".webm")) {
          res.setHeader(
            "Content-Type",
            "video/webm"
          );
        }

        if (filePath.endsWith(".ogg")) {
          res.setHeader(
            "Content-Type",
            "audio/ogg"
          );
        }

        res.setHeader(
          "Accept-Ranges",
          "bytes"
        );
      },
    }
  )
);
const io = require("./socket")(server);

app.set("io", io);

app.get('/.well-known/assetlinks.json', (req, res) => {
  res.json([
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: 'com.outapp.client',
        sha256_cert_fingerprints: [
          'C4:BF:CF:2E:0F:70:CB:3A:6D:A8:19:8C:C1:BE:1D:94:6B:80:EA:E2:23:5B:56:BD:96:AD:0A:05:A6:53:79:77'
        ]
      }
    }
  ]);
});

app.use("/health", (req, res) => res.send(`Welcome to the server`));
app.use("/api/admin", require("./routes/adminRoutes"));
app.use("/api/user", require("./routes/userRoutes"));
app.use("/api/service", require("./routes/serviceRoutes"));
app.use("/api/chat", require("./routes/chatRoutes"));
app.use("/api", require('./routes/paymentRoutes'));
app.use("/api/identity", require("./routes/identity.routes"));

app.use(errorHandler);

server.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
