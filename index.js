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
const { releaseOnCheckIn } = require("./cron/working");

connectDb();
const app = express();
const server = http.createServer(app);
app.use(cors({}));

const port = process.env.PORT || 5000;
cron.schedule("0 * * * *", async () => {
  console.log("Running release cron...");
  await releaseOnCheckIn();
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

app.use("/health", (req, res) => res.send(`Welcome to the server`));
app.use("/api/admin", require("./routes/adminRoutes"));
app.use("/api/user", require("./routes/userRoutes"));
app.use("/api/service", require("./routes/serviceRoutes"));
app.use("/api/chat", require("./routes/chatRoutes"));
app.use("/api", require('./routes/paymentRoutes'));

app.use(errorHandler);


server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
