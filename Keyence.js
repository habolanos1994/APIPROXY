const ftp = require("basic-ftp");
const fs = require("fs");
const { mqttpub } = require("./mqttpublish")
const net = require('net');
const axios = require('axios');  // Added axios import
const os = require('os');
const hostname = os.hostname();
const TCPAPI = 8085;
const { logError } = require("./errorlog")
let requester = ''

const serialNumbersSet = new Set();

async function PostSerialForReceiving(loc, srl) {
  let config;
  try {
    const configFile = fs.readFileSync('./APIMode.json');
    config = JSON.parse(configFile);
  } catch (error) {
    console.error("Error reading or parsing APIMode.json:", error);
    logError(error)
    throw error;
  }

  let APImode = config.ActiveAPI.keyence;
  var urlApi = `${APImode}Programs_NET_2/RCVX/api/RCV/PostSerialForReceiving?loc=ELP&srl=${srl}`;

  try {
    let response = await axios.get(urlApi);
    return response.data;
  } catch (error) {
    console.error("Error getting API data:", error);
    logError(error)
    throw error;
  }
}

async function checkAndUpdateCSV(serialNumber) {
  if (serialNumbersSet.has(serialNumber)) {
    return;
  }

  let response = await PostSerialForReceiving('ELP', serialNumber); // store response to use it in the data object

  const data = {
    serial: serialNumber,
    result: response,
    requester: requester, // add appropriate requester
  };

  mqttpub(`ELP/Returns/PROXY/Keyence/DDATA`, data);

  serialNumbersSet.add(serialNumber); // Add serial number to set
  fs.appendFileSync("serialNumbers.csv", serialNumber + "\n");
}

const server = net.createServer((socket) => {
  requester = socket.remoteAddress; // set requester when connection is established
  console.log(`Client connected: ${socket.remoteAddress}:${socket.remotePort}`);
  socket.on('data', (data) => {
    checkAndUpdateCSV(data.toString().trim());
  });

  // handle client disconnection
  socket.on('end', () => {
    console.log(`Client disconnected: ${socket.remoteAddress}:${socket.remotePort}`);
  });

  // handle socket errors
  socket.on('error', (err) => {
    console.error(`Socket error: ${err}`);
    logError(err) // Corrected here
  });
});

server.on('error', (err) => {
  console.error(`Server error: ${err}`);
  logError(err) // Corrected here
});

function clearCSV() {
  fs.writeFileSync("serialNumbers.csv", "");
  serialNumbersSet.clear(); // Also clear the set
}

// clear the CSV file every 8 hours (28800000 ms)
setInterval(clearCSV, 14400000);

server.listen(TCPAPI, () => {
  console.log(`${hostname}:${TCPAPI}`);  // adjusted here
});

clearCSV()
