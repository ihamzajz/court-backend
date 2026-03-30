const path = require("path");

const { getUploadsRoot } = require("./env");

const getUploadSubdirPath = (directoryName) => path.join(getUploadsRoot(), directoryName);

const getUploadPublicBasePath = (directoryName) => `/uploads/${directoryName}/`;

module.exports = {
  getUploadSubdirPath,
  getUploadPublicBasePath,
};
