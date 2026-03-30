const isDuplicateEntryError = (error) => error?.code === "ER_DUP_ENTRY";

const duplicateResponse = (message = "A record with the same unique value already exists") => ({
  status: 409,
  body: { message },
});

module.exports = {
  isDuplicateEntryError,
  duplicateResponse,
};
