const path = require("path");
const fs = require("fs");

const portalName = process.env.PORTAL;
if (!portalName) {
  // todo: add usage info
  throw new Error("Missing PORTAL variable");
}
const widgetType = process.env.WIDGET_TYPE;
// if (!widgetType) {
//   // todo: add usage info
//   throw new Error("Missing WIDGET_TYPE variable");
// }
const widgetId = process.env.WIDGET_ID;
// if (!widgetId) {
//   // todo: add usage info
//   throw new Error("Missing WIDGET_ID variable");
// }
const parserName = process.env.PARSER;
// if (!parserName) {
//   // todo: add usage info
//   throw new Error("Missing PARSER variable");
// }

function getFilesFromDir(dir, fileTypes) {
  var filesToReturn = [];
  function walkDir(currentPath) {
    var files = fs.readdirSync(currentPath);
    for (var i in files) {
      var curFile = path.join(currentPath, files[i]);      
      if (fs.statSync(curFile).isFile() && fileTypes.indexOf(path.extname(curFile)) != -1) {
        filesToReturn.push(curFile.replace(dir, ''));
      } else if (fs.statSync(curFile).isDirectory()) {
       walkDir(curFile);
      }
    }
  };
  walkDir(dir);
  return filesToReturn; 
}

const portalFiles = getFilesFromDir(`./src/portals/${portalName}/config`, '.tsx');
const portalEntries = portalFiles.reduce((allEntries, srcName) => {
  const resultName = `.${srcName.slice(20)}`.replace('.tsx', '.js');
  const source = `./${srcName}`;
  allEntries[resultName] = source;
  return allEntries;
}, {});

module.exports = [
  {
    name: 'portal',
    entry: `./src/portals/${portalName}/config/widgets/${widgetType}_${widgetId}/parsers/${parserName}/incoming_parser/index.tsx`,
    output: {
      filename: `index.js`,
      path: path.resolve(__dirname, `./portals/${portalName}/config/widgets/${widgetType}_${widgetId}/parsers/${parserName}/incoming_parser`)
    },
    // devtool: "inline-source-map",
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          loader: "babel-loader"
        },
        {
          test: /\.js$/,
          use: ["source-map-loader"],
          enforce: "pre"
        }
      ]
    },
    resolve: {
      extensions: [".tsx", ".ts", ".js"]
    },
    optimization: {
      // We do not want to minimize our code.
      minimize: false
    },
    externals: {
      'react': 'React',
    }
  },
  {
    name: 'hot-reload',
    entry: portalEntries,
    output: {
      filename: `[name]`,
      path: path.resolve(__dirname, `./portals/${portalName}/config`)
    },
    watch: true,
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          loader: "babel-loader",
        },
        {
          test: /\.js$/,
          use: ["source-map-loader"],
          enforce: "pre"
        }
      ]
    },
    resolve: {
      extensions: [".tsx", ".ts", ".js"]
    },
    optimization: {
      // We do not want to minimize our code.
      minimize: false
    },
    externals: {
      'react': 'React',
    },
  }
];