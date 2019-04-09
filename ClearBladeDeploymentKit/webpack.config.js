const path = require("path");
const flags = require("./processFlags");
const {
  portal,
  widgetId,
  widgetType,
  parserName,
  parserType,
  service,
  library,
  portalEntries
} = flags;

module.exports = [
  {
    name: "widget",
    entry: `./src/portals/${portal}/config/widgets/${widgetType}_${widgetId}/parsers/${parserName}/${parserType}/index.tsx`,
    output: {
      filename: `index.js`,
      path: path.resolve(
        __dirname,
        `./portals/${portal}/config/widgets/${widgetType}_${widgetId}/parsers/${parserName}/${parserType}`
      )
    },
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
      minimize: false
    },
    externals: {
      react: "React",
      "react-dom": "ReactDOM"
    }
  },
  {
    name: "clearblade-hot-reload",
    entry: portalEntries,
    output: {
      filename: `[name]`,
      path: path.resolve(__dirname, `./portals/${portal}/config`)
    },
    watch: true,
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
      minimize: false
    },
    externals: {
      react: "React",
      "react-dom": "ReactDOM"
    }
  },
  {
    name: "service",
    entry: `./src/code/services/${service}/${service}.ts`,
    output: {
      filename: `${service}.js`,
      path: path.resolve(__dirname, `./code/services/${service}`)
    },
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
      modules: [path.resolve(__dirname, "src"), "node_modules"],
      extensions: [".tsx", ".ts", ".js"]
    },
    optimization: {
      minimize: false
    }
  },
  {
    name: "library",
    entry: `./src/code/libraries/${library}/${library}.ts`,
    output: {
      filename: `${library}.js`,
      path: path.resolve(__dirname, `./code/libraries/${library}`)
    },
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
      minimize: false
    }
  }
];
