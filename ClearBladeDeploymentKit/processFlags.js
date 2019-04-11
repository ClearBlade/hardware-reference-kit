const fs = require("fs");
const path = require("path");
const chalk = require("chalk");

const npmFlag = "npm_config_";
const configName = process.argv[process.argv.indexOf("--config-name") + 1];

// flag consts
const portal = "portal";
const widgetType = "widgetType";
const widgetId = "widgetId";
const parserName = "parserName";
const parserType = "parserType";
const service = "service";
const library = "library";
const messagePort = "messagePort";
const noSSL = "noSSL";
const caPath = "caPath";

const mapEntityToWebpackConfig = entity => {
  switch (entity) {
    case portal:
      return ["clearblade-hot-reload", "widget"];
    case widgetType:
    case widgetId:
    case parserName:
    case parserType:
      return ["widget"];
    case service:
      return ["service"];
    case library:
      return ["library"];
    default:
      // used for messagePort, noSSL, and caPath because they have defaults to fall back to in clearblade-hot-reload
      return [];
  }
};

const getFlagValue = entity => {
  const val =
    process.env[`${npmFlag}${entity}`] ||
    process.env[`${npmFlag}${entity}`.toLowerCase()];
  if (mapEntityToWebpackConfig(entity).indexOf(configName) > -1 && !val) {
    console.error(chalk.red(`Missing ${entity} flag`));
    throw new Error();
  }
  return val;
};

module.exports = {
  portal: getFlagValue(portal),
  widgetType: getFlagValue(widgetType),
  widgetId: getFlagValue(widgetId),
  parserName: getFlagValue(parserName),
  parserType: getFlagValue(parserType),
  service: getFlagValue(service),
  library: getFlagValue(library),
  messagePort: getFlagValue(messagePort),
  noSSL: getFlagValue(noSSL),
  caPath: getFlagValue(caPath),

  portalEntries: () => {
    if (module.exports.portal && configName === "clearblade-hot-reload") {
      const configPath = `./src/portals/${module.exports.portal}/config`;
      if (fs.existsSync(configPath)) {
        const configDir = "config/";
        function getFilesFromDir(dir, fileTypes) {
          var filesToReturn = [];
          function walkDir(currentPath) {
            var files = fs.readdirSync(currentPath);
            for (var i in files) {
              var curFile = path.join(currentPath, files[i]);
              if (
                fs.statSync(curFile).isFile() &&
                fileTypes.indexOf(path.extname(curFile)) != -1
              ) {
                filesToReturn.push(curFile.replace(dir, ""));
              } else if (fs.statSync(curFile).isDirectory()) {
                walkDir(curFile);
              }
            }
          }
          walkDir(dir);
          return filesToReturn;
        }
        const portalFiles = getFilesFromDir(configPath, ".tsx");
        return (portalEntries = portalFiles.reduce((allEntries, srcName) => {
          const resultName = `${srcName.slice(
            srcName.indexOf(configDir) + configDir.length
          )}`.replace(".tsx", ".js");
          const source = `./${srcName}`;
          allEntries[resultName] = source;
          return allEntries;
        }, {}));
      } else {
        console.error(
          chalk.red(
            `Missing src path: ${configPath}. To resolve this issue, create a 'src' directory in the root directory of this system and add a new file to it with the relative path of the target widget's .js parser file in the portal directory.`
          )
        );
        throw new Error();
      }
    }
  }
};
