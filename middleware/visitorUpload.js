const multer = require("multer");
const path = require("path");
const crypto = require("crypto");
const fs = require("fs");

const BASE_UPLOAD_PATH = path.join(process.cwd(), "uploads");

/* =====================================================
   Visitor Identity Document Upload Directory
====================================================== */

const VISITOR_UPLOAD_DIR = path.join(BASE_UPLOAD_PATH, "identityDocuments");

const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

/* =====================================================
   Storage Configuration
====================================================== */

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    ensureDir(VISITOR_UPLOAD_DIR);
    cb(null, VISITOR_UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const filename = `${crypto.randomUUID()}${ext}`;
    cb(null, filename);
  },
});

/* =====================================================
   Allowed MIME Types for Identity Documents
====================================================== */

const ALLOWED_DOCUMENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/jpg",
  "image/webp",
  "application/pdf",
]);

const fileFilter = (req, file, cb) => {
  if (!ALLOWED_DOCUMENT_TYPES.has(file.mimetype)) {
    return cb(
      new Error("Only image files and PDFs are allowed!"),
      false
    );
  }
  cb(null, true);
};

/* =====================================================
   Multer Instance — Max 5MB for Identity Documents
====================================================== */

const visitorUpload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB
  },
});

module.exports = { visitorUpload };
