const nodemailer = require("nodemailer");
const smtpTransport = require("nodemailer-smtp-transport");
const mailTemplates = require("../models/mailTemplates");

module.exports.sendMail = (templateName, mailVariables, email) => {
  return new Promise(async function (resolve, reject) {
    try {
      const template = await mailTemplates
        .findOne({
          templateEvent: templateName,
          isDeleted: false,
          active: true,
        })
        .lean(true);
      let subject = template?.subject;
      let html = template?.htmlBody;
      let text = template?.textBody;

      const transporter = nodemailer.createTransport(
        smtpTransport({
          pool: true,
          host: "smtp.gmail.com",
          port: 465,
          auth: {
            user: process.env.MAIL_USER,
            pass: process.env.MAIL_PASS,
          },
          secure: true,
          // tls: {
          //   rejectUnauthorized: false,
          // },
        })
      );

      for (let key in mailVariables) {
        subject = subject?.replaceAll(key, mailVariables[key]);
        html = html?.replaceAll(key, mailVariables[key]);
        text = text?.replaceAll(key, mailVariables[key]);
      }
      // const whitelist = [
      //   "whitelisted@example.com",
      //   "trusteduser@example.com",
      //   "anothertrusted@domain.com",
      // ];
      const options = {
        from: process.env.MAIL_USER,
        to: email,
        subject: subject,
        text: text,
        html: html,
      };

      transporter.sendMail(options, function (error) {
        if (error) {
          return reject(error);
        }

        return resolve({
          type: "success",
          message: "Mail successfully sent",
        });
      });
    } catch (error) {
      return reject(error);
    }
  });
};
