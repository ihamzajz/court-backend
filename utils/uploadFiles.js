const fs = require("fs");
const path = require("path");

const getStoredFilename = (value) => {
  if (!value) return null;
  return path.basename(String(value));
};

const deleteFileIfExists = (directoryPath, storedValue) => {
  const filename = getStoredFilename(storedValue);
  if (!filename) return;

  const filePath = path.join(directoryPath, filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
};

module.exports = {
  deleteFileIfExists,
  getStoredFilename,
};
