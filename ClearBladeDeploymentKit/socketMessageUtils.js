const fs = require('fs');
const path = require('path');

// setting consts
const widgetDataTypeSetting = 'dataType';
const widgetParserTypes = ['incoming_parser', 'outgoing_parser'];
const dsParserName = `DATASOURCE_PARSER`;

// filename consts
const widgetSettingsFile = `settings.json`;
const widgetMetaFile = `meta.json`;
const dsMetaFile = `meta.json`;
const dsParserFile = `parser.js`;
const iRMetaFile = `meta.json`;

// path consts
const portalName = process.env.PORTAL;
const configPath = `./portals/${portalName}/config`;
const widgetsPathname = `widgets`;
const dsPathname = 'datasources';
const iRPathname = 'internalResources';

// utils
const getWidgetId = (fullResource) => {
  return fullResource.split('_').pop();
}

const findWidgetParserSettings = (settings) => {
  const parsers = [];
  for (const setting in settings) {
    if (settings[setting].hasOwnProperty(widgetDataTypeSetting)) {
      parsers.push(setting);
    }
  }
  return parsers;
}

const findWidgetParserType = (parserObj) => {
  for (const key in parserObj) {
    if (widgetParserTypes.indexOf(key) > -1) {
      return key;
    }
  }
}

const calculateWidgetParserContent = (parserValuePath, fullResource) => {
  if (typeof parserValuePath === 'object') {
    return  {
      JavaScript: fs.readFileSync(path.join(__dirname, `${configPath}/${widgetsPathname}/${fullResource}/${parserValuePath.JavaScript.slice(2)}`)).toString(),
      HTML: fs.readFileSync(path.join(__dirname, `${configPath}/${widgetsPathname}/${fullResource}/${parserValuePath.HTML.slice(2)}`)).toString(),
      CSS: fs.readFileSync(path.join(__dirname, `${configPath}/${widgetsPathname}/${fullResource}/${parserValuePath.CSS.slice(2)}`)).toString(),
    }
  } else {
    return fs.readFileSync(path.join(__dirname, `${configPath}/${widgetsPathname}/${fullResource}/${parserValuePath.slice(2)}`)).toString()
  }
}

const calculateWidgetSettings = (pathArr) => {
  const fullResource = pathArr[1];
  const widgetMeta = JSON.parse(fs.readFileSync(path.join(__dirname, `${configPath}/${widgetsPathname}/${fullResource}/${widgetMetaFile}`)).toString());
  const widgetSettings = JSON.parse(fs.readFileSync(path.join(__dirname, `${configPath}/${widgetsPathname}/${fullResource}/${widgetSettingsFile}`)).toString());
  const parserSettings = findWidgetParserSettings(widgetSettings);

  const returnObj = {
    resourceType: 'widget',
    resourceId: getWidgetId(fullResource),
    payload: {
      widgetInfo: {
        ...widgetMeta,
        props: {
          ...widgetSettings
        }
      }
    }
  }

  for (let i = 0; i < parserSettings.length; i++) {
    const parserObj = widgetSettings[parserSettings[i]];
    if (parserObj.hasOwnProperty('value')) { // static or calculated
      returnObj.payload.widgetInfo.props[parserSettings[i]].value = calculateWidgetParserContent(returnObj.payload.widgetInfo.props[parserSettings[i]].value, fullResource)
    } else { // is dynamic
      const parserType = findWidgetParserType(widgetSettings[parserSettings[i]]);
      returnObj.payload.widgetInfo.props[parserSettings[i]][parserType].value = calculateWidgetParserContent(returnObj.payload.widgetInfo.props[parserSettings[i]][parserType].value, fullResource)
    }
  }
  return returnObj;
}

const calculateDsSettings = (pathArr) => {
  const dsName = pathArr[1];
  const dsMeta = JSON.parse(fs.readFileSync(path.join(__dirname, `${configPath}/${dsPathname}/${dsName}/${dsMetaFile}`)).toString());
  if (dsMeta.settings.hasOwnProperty(dsParserName)) {
    dsMeta.settings[dsParserName] = fs.readFileSync(path.join(__dirname, `${configPath}/${dsPathname}/${dsName}/${dsParserFile}`)).toString();
  }

  return {
    resourceType: 'datasource',
    resourceId: dsMeta.id,
    payload: dsMeta
  }
}

const calculateIResourceSettings = (pathArr) => {
  const iRName = pathArr[1];
  const iRMeta = JSON.parse(fs.readFileSync(path.join(__dirname, `${configPath}/${iRPathname}/${iRName}/${iRMetaFile}`)).toString());
  iRMeta.file = fs.readFileSync(path.join(__dirname, `${configPath}/${iRPathname}/${iRName}/${iRMeta.file.slice(2)}`)).toString();
  iRMeta.lastUpdated = Date.now();

  return {
    resourceType: 'internalResource',
    resourceId: iRMeta.id,
    payload: iRMeta
  }
}

module.exports = {
  parseChangedFilePath: (filePath) => {
    const pathArr = filePath.split('/');
    const resource = pathArr[0];
    switch(resource) {
      case widgetsPathname:
        return calculateWidgetSettings(pathArr);
      case dsPathname:
        return calculateDsSettings(pathArr);
      case iRPathname:
        return calculateIResourceSettings(pathArr);
      default:
        console.log("Cannot perform hot reload on internal resources");
    }
  }
}
