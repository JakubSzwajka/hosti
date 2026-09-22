const path = require("node:path");
const config = require("../../../.dependency-cruiser.cjs");

module.exports = {
  ...config,
  options: {
    ...config.options,
    tsConfig: {
      fileName: path.join(__dirname, "fixtures/dependencies/tsconfig.json"),
    },
  },
};
