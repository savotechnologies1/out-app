const Notification = require("../models/Notification");

exports.getNotifications = async (req, res) => {
    try {
        const { page = 1, limit = 10 } = req.query;

        const receiverId = req.user._id;
        const receiverModel =
            req.user.role === "user" ? "User" : "ServiceUser";
        const skip = (page - 1) * limit;

        const notifications = await Notification.find({
            receiverId,
            receiverModel,
            isDeleted: false,
        })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const total = await Notification.countDocuments({
            receiverId,
            receiverModel,
            isDeleted: false,
        });

        res.status(200).json({
            success: true,
            total,
            page: Number(page),
            pages: Math.ceil(total / limit),
            data: notifications,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getSingleNotification = async (req, res) => {
    try {
        const notification = await Notification.findOne({
            _id: req.params.id,
            receiverId: req.user._id,
            receiverModel:
                req.user.role === "user" ? "User" : "ServiceUser",
            isDeleted: false,
        });

        if (!notification) {
            return res.status(404).json({
                success: false,
                message: "Notification not found",
            });
        }

        res.status(200).json({
            success: true,
            data: notification,
        });

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.markAsRead = async (req, res) => {
    try {
        const notification = await Notification.findOneAndUpdate(
            {
                _id: req.params.id,
                receiverId: req.user._id,
                receiverModel:  req.user.role === "user" ? "User" : "ServiceUser",
            },
            {
                isRead: true,
                readAt: new Date(),
            },
            { new: true }
        );

        if (!notification) {
            return res.status(404).json({
                success: false,
                message: "Notification not found",
            });
        }

        res.status(200).json({
            success: true,
            data: notification,
        });

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.deleteNotification = async (req, res) => {
    try {
        const notification = await Notification.findOneAndUpdate(
            {
                _id: req.params.id,
                receiverId: req.user._id,
                receiverModel:  req.user.role === "user" ? "User" : "ServiceUser",
            },
            { isDeleted: true },
            { new: true }
        );

        if (!notification) {
            return res.status(404).json({
                success: false,
                message: "Notification not found",
            });
        }

        res.status(200).json({
            success: true,
            message: "Notification deleted successfully",
        });

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.markAllAsRead = async (req, res) => {
    try {
        await Notification.updateMany(
            {
                receiverId: req.user._id,
                receiverModel:  req.user.role === "user" ? "User" : "ServiceUser",
                isRead: false,
            },
            {
                isRead: true,
                readAt: new Date(),
            }
        );

        res.status(200).json({
            success: true,
            message: "All notifications marked as read",
        });

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.deleteAllNotifications = async (req, res) => {
    try {
        await Notification.updateMany(
            {
                receiverId: req.user._id,
                receiverModel:  req.user.role === "user" ? "User" : "ServiceUser",
                isDeleted: false,
            },
            {
                isDeleted: true,
            }
        );

        res.status(200).json({
            success: true,
            message: "All notifications deleted",
        });

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};