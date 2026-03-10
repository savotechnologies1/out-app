const express = require("express");
const path = require("path");
const connectDb = require("./config/dbConnection");
const cors = require("cors");
const dotenv = require("dotenv").config();
const fs = require("fs");
const helmet = require("helmet");
const errorHandler = require("./middleware/errorHandler");
const http = require("http");

connectDb();
const app = express();
const server = http.createServer(app);
app.use(cors({}));

const port = process.env.PORT || 5000;

// app.use(helmet());
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);
app.use(express.json({ limit: "30mb" }));
app.use(express.urlencoded({ extended: true, limit: "30mb" }));
const directory = path.join(__dirname);
app.use(express.static(directory));

app.use("/health", (req, res) => res.send(`Welcome to the server`));
app.use("/api/admin", require("./routes/adminRoutes"));
app.use("/api/user", require("./routes/userRoutes"));
app.use("/api/service", require("./routes/serviceRoutes"));
app.use("/api/chat", require("./routes/chatRoutes"));
app.use("/api", require('./routes/paymentRoutes'));

app.use(errorHandler);

require("./socket")(server);

server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
