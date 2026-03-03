const mongoose = require("mongoose");
const MailTemplate = require("../models/mailTemplates");
const Admin = require("../models/Admin");

mongoose.set("strictQuery", true);

const connectDb = async () => {
  try {
    const { connection } = await mongoose.connect(
      process.env.CONNECTION_STRING
    );

    console.log(`MongoDB Connected: ${connection.host}`);

    const [checkAdmin, template] =
      await Promise.all([
        Admin.countDocuments({}),
        MailTemplate.countDocuments({})
      ]);

    if (!checkAdmin) {
      await Admin.create({
        firstName: "Admin",
        lastName: "User",
        email: "gd34.stpl@gmail.com",
        phone: "+911234567890",
        password: "Admin@123",
      });
    }

    if (!template) {
      await MailTemplate.insertMany([
        {
          templateEvent: "account-created",
          subject: "Account created successfully",
          mailVariables: "%fullName% %email% %phone%",
          htmlBody: `<!DOCTYPE html> <html lang="en"> <head> <meta charset="UTF-8" /> <meta name="viewport" content="width=device-width, initial-scale=1.0" /> <title>Document</title> </head> <body> <h3>Become an artist Details: -</h3><table border="2px" width ="50%"><tr><th>FullName</th><td>Email</td><td>Phone</td></tr><tr><td>%fullName%</td><td>%email%</td><td>%phone%</td></tr></table></body></html>`,
          textBody: "Account created successfully: %fullName% %email% %phone%",
        },
        {
          templateEvent: "send-forgotpassword-otp",
          subject: "OUT OTP Verification",
          mailVariables: "%otp%",
          htmlBody: `<!DOCTYPE html>
          <html lang="en">
            <head>
              <meta charset="UTF-8" />
              <meta name="viewport" content="width=device-width, initial-scale=1.0" />
              <title>OTP Verification</title>
            </head>
            <body
              style="
                font-family: Arial, sans-serif;
                background-color: #f4f7fc;
                margin: 0;
                padding: 0;
              "
            >
              <div
                style="
                  width: 100%;
                  max-width: 600px;
                  margin: 40px auto;
                  background-color: #ffffff;
                  padding: 30px 0px;
                  border-radius: 10px;
                  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
                  text-align: center;
                "
              >
                <h1 style="font-size: 28px; color: #2c3e50; margin-bottom: 20px">
                  Verify Your Identity
                </h1>
  
                <p style="font-size: 16px; color: #7f8c8d; line-height: 1.8">Hello,</p>
                <p style="font-size: 16px; color: #7f8c8d; line-height: 1.8">
               Your One-Time Password (OTP) for verification is:
                </p>
  
                <div
                  style="
               font-size: 40px;
                    font-weight: bold;
                    color: white;
                    margin: 30px 0;
                    background-color:black;
                    padding: 10px 30px;
                    border-radius: 5px;
                    display: inline-block;
                  "
                >
                  %otp%
                </div>
  
                <p style="font-size: 16px; color: #7f8c8d; line-height: 1.8">
               Please use this OTP to complete your verification. The OTP is valid for the next 10 minutes.
                  support.
                </p>
  
                <div
                  style="
                    margin-top: 40px;
                    font-size: 14px;
                    color: #bdc3c7;
                    border-top: 1px solid #f1f1f1;
                    padding-top: 20px;
                  "
                >
                  <p style="margin: 0">&copy; 2024 OUT. All rights reserved.</p>
                </div>
              </div>
            </body>
          </html>
      .`,
          textBody: "Your OUT Verification code is %otp%.",
        },
        {
          templateEvent: "user-block",
          subject: "OUT Account Update",
          mailVariables: "%name%",
          htmlBody: `<!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Account Update</title>
    </head>
    <body
      style="
        font-family: Arial, sans-serif;
        background-color: #f4f7fc;
        margin: 0;
        padding: 0;
      "
    >
      <div
        style="
          width: 100%;
          max-width: 600px;
          margin: 40px auto;
          background-color: #ffffff;
          padding: 30px 0px;
          border-radius: 10px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
          text-align: center;
        "
      >
        <h1 style="font-size: 28px; color: #2c3e50; margin-bottom: 20px">
          Account Update
        </h1>

        <p style="font-size: 16px; color: #7f8c8d; line-height: 1.8">
          Hello %name%,
        </p>

        <p style="font-size: 16px; color: #7f8c8d; line-height: 1.8">
          Your OUT account is currently not accessible.
        </p>

        <p style="font-size: 16px; color: #7f8c8d; line-height: 1.8">
          For further details, please contact support.
        </p>

        <div
          style="
            margin-top: 40px;
            font-size: 14px;
            color: #bdc3c7;
            border-top: 1px solid #f1f1f1;
            padding-top: 20px;
          "
        >
          <p style="margin: 0">&copy; 2024 OUT. All rights reserved.</p>
        </div>
      </div>
    </body>
  </html>
  `,
          textBody: "Hello %name%, your OUT account is currently not accessible. Please contact support."
        },
        {
          templateEvent: "user-unblock",
          subject: "OUT Account Update",
          mailVariables: "%name%",
          htmlBody: `<!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Account Update</title>
    </head>
    <body
      style="
        font-family: Arial, sans-serif;
        background-color: #f4f7fc;
        margin: 0;
        padding: 0;
      "
    >
      <div
        style="
          width: 100%;
          max-width: 600px;
          margin: 40px auto;
          background-color: #ffffff;
          padding: 30px 0px;
          border-radius: 10px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
          text-align: center;
        "
      >
        <h1 style="font-size: 28px; color: #2c3e50; margin-bottom: 20px">
          Account Update
        </h1>

        <p style="font-size: 16px; color: #7f8c8d; line-height: 1.8">
          Hello %name%,
        </p>

        <p style="font-size: 16px; color: #7f8c8d; line-height: 1.8">
          Your OUT account access has been restored.
        </p>

        <p style="font-size: 16px; color: #7f8c8d; line-height: 1.8">
          You may now log in and continue using our services.
        </p>

        <div
          style="
            margin-top: 40px;
            font-size: 14px;
            color: #bdc3c7;
            border-top: 1px solid #f1f1f1;
            padding-top: 20px;
          "
        >
          <p style="margin: 0">&copy; 2024 OUT. All rights reserved.</p>
        </div>
      </div>
    </body>
  </html>
  `,
          textBody: "Hello %name%, your OUT account access has been restored. You may now log in."
        }
      ]);
    }

  } catch (err) {
    console.log(err);
    process.exit(1);
  }
};

module.exports = connectDb;
