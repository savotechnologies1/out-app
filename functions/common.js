// const multer = require("multer");
// const { upload } = require("./upload");
const Availability = require("../models/Availability");

module.exports.createLog = (logName) => {
  try {
    return require("simple-node-logger").createRollingFileLogger({
      logDirectory: "logs", // NOTE: folder must exist and be writable...
      fileNamePattern: logName + "_<DATE>.log",
      dateFormat: "YYYY_MM_DD",
      timestampFormat: "YYYY-MM-DD HH:mm:ss",
    });
  } catch (error) {
    throw error;
  }
};

module.exports.generateRandomId = (user) => {
  try {
    const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

    const length = 10;
    let result = "";

    for (let i = 0; i < length; i++) {
      const randomIndex = Math.floor(Math.random() * characters.length);
      result += characters[randomIndex];
    }

    return result;
  } catch (error) {
    throw error;
  }
};

module.exports.generateRandomOTP = () => {
  try {
    const digits = "0123456789";
    let OTP = "";
    for (let i = 0; i < 4; i++) {
      OTP += digits[Math.floor(Math.random() * 10)];
    }
    return OTP;
  } catch (error) {
    throw error;
  }
};

module.exports.generateRandomOrderId = () => {
  try {
    const characters =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

    const length = 25;
    let result = "";

    for (let i = 0; i < length; i++) {
      const randomIndex = Math.floor(Math.random() * characters.length);
      result += characters[randomIndex];
    }

    return result;
  } catch (error) {
    throw error;
  }
};

module.exports.codeRem = (phone) => {
   if (!phone) return "";
  try {
    let phoneArray = [
      "+93",
      "+27",
      "+355",
      "+49",
      "+376",
      "+244",
      "+1264",
      "+672",
      "+1268",
      "+966",
      "+213",
      "+54",
      "+374",
      "+297",
      "+61",
      "+43",
      "+994",
      "+1242",
      "+973",
      "+880",
      "+1246",
      "+32",
      "+501",
      "+229",
      "+1441",
      "+375",
      "+591",
      "+387",
      "+267",
      "+55",
      "+673",
      "+359",
      "+226",
      "+257",
      "+975",
      "+238",
      "+237",
      "+855",
      "+1",
      "+974",
      "+7",
      "+235",
      "+56",
      "+86",
      "+357",
      "+65",
      "+57",
      "+269",
      "+242",
      "+850",
      "+82",
      "+225",
      "+506",
      "+385",
      "+53",
      "+599",
      "+45",
      "+253",
      "+1767",
      "+20",
      "+503",
      "+971",
      "+593",
      "+291",
      "+421",
      "+386",
      "+34",
      "+1",
      "+372",
      "+251",
      "+679",
      "+63",
      "+358",
      "+33",
      "+241",
      "+220",
      "+233",
      "+995",
      "+350",
      "+1473",
      "+30",
      "+299",
      "+590",
      "+1671",
      "+502",
      "+44",
      "+592",
      "+594",
      "+224",
      "+240",
      "+245",
      "+509",
      "+31",
      "+504",
      "+852",
      "+36",
      "+967",
      "+55",
      "+262",
      "+44",
      "+590",
      "+0",
      "+61",
      "+672",
      "+358",
      "+1345",
      "+672",
      "+682",
      "+500",
      "+298",
      "+500",
      "+1670",
      "+692",
      "+246",
      "+64",
      "+677",
      "+1649",
      "+1340",
      "+1284",
      "+91",
      "+62",
      "+98",
      "+964",
      "+353",
      "+354",
      "+972",
      "+39",
      "+1876",
      "+81",
      "+44",
      "+962",
      "+686",
      "+383",
      "+965",
      "+856",
      "+266",
      "+371",
      "+961",
      "+231",
      "+218",
      "+423",
      "+370",
      "+352",
      "+853",
      "+389",
      "+261",
      "+60",
      "+265",
      "+960",
      "+223",
      "+356",
      "+212",
      "+596",
      "+230",
      "+222",
      "+269",
      "+52",
      "+691",
      "+258",
      "+373",
      "+377",
      "+976",
      "+382",
      "+1664",
      "+95",
      "+264",
      "+674",
      "+977",
      "+505",
      "+227",
      "+234",
      "+683",
      "+47",
      "+687",
      "+64",
      "+968",
      "+680",
      "+507",
      "+675",
      "+92",
      "+595",
      "+51",
      "+689",
      "+48",
      "+1787",
      "+351",
      "+254",
      "+996",
      "+44",
      "+236",
      "+242",
      "+1809",
      "+420",
      "+40",
      "+250",
      "+70",
      "+212",
      "+599",
      "+684",
      "+1684",
      "+378",
      "+290",
      "+1758",
      "+590",
      "+1869",
      "+1",
      "+508",
      "+239",
      "+1784",
      "+221",
      "+232",
      "+381",
      "+248",
      "+963",
      "+252",
      "+94",
      "+268",
      "+249",
      "+211",
      "+46",
      "+41",
      "+597",
      "+47",
      "+66",
      "+886",
      "+992",
      "+255",
      "+262",
      "+246",
      "+970",
      "+670",
      "+228",
      "+676",
      "+690",
      "+1868",
      "+216",
      "+7370",
      "+90",
      "+688",
      "+380",
      "+256",
      "+598",
      "+998",
      "+678",
      "+39",
      "+58",
      "+84",
      "+681",
      "+260",
      "+263",
    ];

    for (let data of phoneArray) {
      phone = phone.replace(data, "");
    }

    return phone;
  } catch (error) {
    throw error;
  }
};

// module.exports.fileUploadFunc = (request, response) => {
//   return new Promise(async function (resolve, reject) {
//     try {
//       upload(request, response, (err) => {
//         if (request.files && !Object.keys(request.files).length) {
//           return resolve({
//             type: "fileNotFound",
//             status: 400,
//           });
//         }

//         if (request.fileValidationError) {
//           return resolve({
//             type: request.fileValidationError,
//             status: 400,
//           });
//         }

//         if (err instanceof multer.MulterError) {
//           if (err.code === "LIMIT_UNEXPECTED_FILE") {
//             return resolve({
//               type: "Unexpected file field",
//               status: 400,
//             });
//           }
//         } else if (err) {
//           return resolve({
//             type: "File upload failed",
//             status: 400,
//           });
//         }

//         return resolve({
//           type: "success",
//           status: 200,
//           data: request.files,
//         });
//       });
//     } catch (error) {
//       return reject(error);
//     }
//   });
// };

module.exports.humanize = (str) => {
  if (!str) return "";
  return str
    .trim()
    .split(/\s+/)
    .map((word) =>
      word
        .split("-")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join("-")
    )
    .join(" ");
};

module.exports.paginationQuery = (data) => {
  try {
    let page = parseInt(data?.page) || 1;
    const pageSize = parseInt(data?.limit) || 10;
    const skip = (page - 1) * pageSize;
    return {
      page,
      pageSize,
      skip,
    };
  } catch (error) {
    throw error;
  }
};

module.exports.pagination = (data) => {
  try {
    let obj = {};
    const totalPages = Math.ceil(data.total / data.pageSize);

    if (data.page > totalPages) {
      data.page = 1;
    }

    obj = {
      page: data.page,
      hasPrevious: data.page > 1,
      previous: data.page - 1,
      hasNext: data.page < totalPages,
      next: data.page < totalPages ? data.page + 1 : 0,
      totalPages,
    };

    return obj;
  } catch (error) {
    throw error;
  }
};

module.exports.generateAvailability = async (hotelId) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const nextYear = new Date(today);
  nextYear.setFullYear(nextYear.getFullYear() + 1);

  let bulkOps = [];

  for (let d = new Date(today); d <= nextYear; d.setDate(d.getDate() + 1)) {
    const date = new Date(d);

    bulkOps.push({
      updateOne: {
        filter: { hotel: hotelId, date },
        update: {
          $setOnInsert: {
            hotel: hotelId,
            date,
            isBooked: false
          }
        },
        upsert: true
      }
    });
  }

  await Availability.bulkWrite(bulkOps);
};


