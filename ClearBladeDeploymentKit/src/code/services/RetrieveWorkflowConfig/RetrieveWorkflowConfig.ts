import "@babel/polyfill";
import CONFIGURATION from "lib/backend/Configuration";

function RetrieveWorkflowConfig(req: CbServer.BasicReq, resp: CbServer.Resp) {
  log(CONFIGURATION);
  resp.success(CONFIGURATION);
}

// @ts-ignore
global.RetrieveWorkflowConfig = RetrieveWorkflowConfig;
