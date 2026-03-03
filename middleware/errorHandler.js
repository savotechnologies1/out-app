const multer = require("multer");

const errorHandler = (err, req, res, next) => {

    if (err instanceof multer.MulterError) {

        if (err.code === "LIMIT_FILE_SIZE") {
            return res.status(400).json({
                success: false,
                message: "File size exceeds the allowed limit (2MB for images).",
            });
        }

        return res.status(400).json({
            success: false,
            message: err.message || "Multer upload error",
        });
    }

    if (err.message === "Unsupported file type") {
        return res.status(400).json({
            success: false,
            message: "Only allowed file types can be uploaded.",
        });
    }

    if (err.message === "Only image files and PDFs are allowed!") {
        return res.status(400).json({
            success: false,
            message: err.message,
        });
    }

    return res.status(500).json({
        success: false,
        message: err.message || "Internal Server Error",
    });
};

module.exports = errorHandler;